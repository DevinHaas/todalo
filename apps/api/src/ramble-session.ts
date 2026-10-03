import {
  createRambleSession, removeStagedTodo,
  type RambleSessionState, type RambleTodo,
} from "@todalo/ramble";
import type { SpeechCallbacks, SpeechConnection } from "./elevenlabs";
import { applySemanticOperations, type SemanticProcessor, type SemanticProject } from "@todalo/ramble/semantic";

export interface SessionDependencies {
  send(message: unknown): void;
  speech(callbacks: SpeechCallbacks): SpeechConnection;
  semantic: SemanticProcessor;
  commit(todos: RambleTodo[], timeZone: string): Promise<number>;
  smartRecognition: boolean;
  projectIds: Set<string>;
  projects: SemanticProject[];
}

export class RambleConnection {
  state: RambleSessionState;
  private speech?: SpeechConnection;
  private timeZone = "UTC";
  private phase: "idle" | "capturing" | "saving" | "saved" | "closed" = "idle";
  private acceptingTranscripts = true;
  private pending = Promise.resolve();
  private pendingCount = 0;
  private segmentsSeen = 0;
  private recentSpeech: string[] = [];
  private failedSegments: string[] = [];
  private processingAbort?: AbortController;

  constructor(private readonly dependencies: SessionDependencies) {
    this.state = createRambleSession({ smartRecognition: dependencies.smartRecognition });
    this.publish();
  }

  private publish() {
    if (this.phase !== "closed") this.dependencies.send({ type: "state", state: this.state });
  }

  private error(code: string, message: string) {
    if (this.phase !== "closed") this.dependencies.send({ type: "error", code, message });
  }

  // Exposed for provider injection in tests; never accepts browser text as
  // finalized speech in the production WebSocket protocol.
  transcript(text: string, final: boolean): Promise<void> {
    if (!this.acceptingTranscripts || this.phase === "saved" || this.phase === "closed") return Promise.resolve();
    if (text.length > 4000) { this.error("segment_limit", "That phrase was too long. Try a shorter task."); return Promise.resolve(); }
    this.dependencies.send({ type: "transcript", text, final });
    if (!final || !text.trim()) return Promise.resolve();
    if (this.pendingCount >= 8 || ++this.segmentsSeen > 240) {
      this.acceptingTranscripts = false;
      if (this.phase === "capturing") this.phase = "idle";
      // Keep the overflow phrase after earlier work, so retry cannot reorder
      // speech or silently omit a task from a later save.
      this.pending = this.pending.then(() => { if (this.phase !== "closed") this.failedSegments.push(text); });
      this.error("understanding_failed", "Speech arrived too quickly or this session is too long. Retry understanding, then save and start a new session.");
      return this.pending;
    }
    return this.enqueueSegment(text);
  }

  private enqueueSegment(text: string): Promise<void> {
    this.pendingCount += 1;
    this.dependencies.send({ type: "processing", pending: this.pendingCount });
    this.pending = this.pending.then(async () => {
      if (this.phase === "closed" || this.phase === "saved" || this.state.readyToCommit) return;
      if (this.failedSegments.length) { this.failedSegments.push(text); return; }
      const controller = new AbortController();
      this.processingAbort = controller;
      try {
        const operations = await this.dependencies.semantic.process({
          text, state: this.state, timeZone: this.timeZone,
          projects: this.dependencies.projects, recentSpeech: this.recentSpeech,
        }, controller.signal);
        if (controller.signal.aborted || (this.phase as string) === "closed") return;
        const endAllowed = ["done", "stop", "that's all"].includes(text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?,;:]+$/g, "").trim());
        if (operations.some((operation) => operation.type === "end") && !endAllowed) throw new Error("Unexpected end command");
        this.state = applySemanticOperations(operations, this.state, this.dependencies.projectIds);
        this.recentSpeech = [...this.recentSpeech.slice(-3), text];
        this.publish();
        if (this.state.readyToCommit) {
          this.acceptingTranscripts = false;
          // Saving waits for this queue; never await it from inside the queue.
          queueMicrotask(() => { void this.save(false); });
        }
      } catch {
        if (controller.signal.aborted || (this.phase as string) === "closed") return;
        this.failedSegments.push(text);
        this.acceptingTranscripts = false;
        if (this.phase !== "saving") this.phase = "idle";
        this.error("understanding_failed", "Task understanding failed. Your staged tasks are safe. Retry understanding before saving.");
      } finally {
        if (this.processingAbort === controller) this.processingAbort = undefined;
      }
    }).finally(() => {
      this.pendingCount -= 1;
      if (this.phase !== "closed") this.dependencies.send({ type: "processing", pending: this.pendingCount });
    });
    return this.pending;
  }

  async message(message: unknown) {
    if (this.phase === "closed" || this.phase === "saved") return;
    if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
      const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
      if (this.phase === "capturing" && bytes.byteLength <= 64_000 && bytes.byteLength % 2 === 0) this.speech?.audio(bytes);
      return;
    }
    if (!message || typeof message !== "object") { this.error("invalid_message", "Invalid capture message."); return; }
    const input = message as Record<string, unknown>;
    if (input.type === "ping") return;
    if (input.type === "discard") { this.close(); return; }
    if (this.phase === "saving") return;
    if (input.type === "retry-understanding") {
      await this.pending;
      if ((this.phase as string) === "closed") return;
      const failed = this.failedSegments.splice(0);
      for (const text of failed) this.enqueueSegment(text);
      await this.pending;
      if (!this.failedSegments.length) this.dependencies.send({ type: "understanding_recovered" });
      return;
    }
    if (input.type === "remove" && typeof input.id === "string") {
      this.pending = this.pending.then(() => {
        if (this.phase === "closed" || this.phase === "saved") return;
        this.state = removeStagedTodo(input.id as string, this.state).nextState;
        this.publish();
      });
      await this.pending;
    } else if (input.type === "commit") {
      await this.save(true);
    } else if (input.type === "start") {
      const options = input.options as Record<string, unknown> | undefined;
      if (!options || typeof options !== "object") { this.error("invalid_start", "Missing capture options."); return; }
      if (this.phase === "capturing") { this.error("already_started", "A capture is already running."); return; }
      if (this.failedSegments.length) { this.error("understanding_failed", "Retry understanding before recording more speech."); return; }
      try { this.dependencies.semantic.assertConfigured(); }
      catch { this.error("understanding_unavailable", "Task understanding is not configured on this server."); return; }
      const projectId = typeof options.projectId === "string" ? options.projectId : null;
      if (projectId && !this.dependencies.projectIds.has(projectId)) { this.error("invalid_project", "That project is not available."); return; }
      const referenceText = options.referenceDate;
      if (typeof referenceText !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(referenceText)) {
        this.error("invalid_date", "Invalid capture date."); return;
      }
      const referenceDate = new Date(referenceText);
      if (Number.isNaN(referenceDate.getTime())) { this.error("invalid_date", "Invalid capture date."); return; }
      try {
        const zone = typeof options.timeZone === "string" ? options.timeZone : "UTC";
        new Intl.DateTimeFormat("en", { timeZone: zone }).format(referenceDate);
        this.timeZone = zone;
      } catch { this.error("invalid_zone", "Your timezone could not be recognized."); return; }
      const defaultDueDate = typeof options.defaultDueDate === "string" ? options.defaultDueDate : null;
      if (defaultDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(defaultDueDate)) { this.error("invalid_date", "Invalid capture date."); return; }
      if (this.state.todos.length === 0) {
        this.state = createRambleSession({ referenceDate, projectId, smartRecognition: this.dependencies.smartRecognition, defaultDueDate });
      }
      this.acceptingTranscripts = true;
      this.speech?.close();
      this.phase = "capturing";
      this.publish();
      try {
        this.speech = this.dependencies.speech({
          ready: () => {
            if (this.phase === "capturing") this.dependencies.send({ type: "ready" });
          },
          transcript: (text, final) => this.transcript(text, final),
          error: (message) => {
            if (this.phase === "saving" || this.phase === "saved" || this.phase === "closed") return;
            if (this.phase === "capturing") this.phase = "idle";
            this.error("speech_unavailable", message);
          },
        });
      } catch {
        this.phase = "idle";
        this.error("speech_unavailable", "Voice capture is unavailable. Check the speech service configuration.");
      }
    } else {
      this.error("invalid_message", "Unknown capture message.");
    }
  }

  private async save(flush: boolean) {
    if (this.phase === "saving" || this.phase === "saved" || this.phase === "closed") return;
    this.phase = "saving";
    try {
      if (flush) await this.speech?.finish();
      await this.pending;
      if ((this.phase as string) === "closed") return;
      if (this.failedSegments.length) throw new Error("Unprocessed speech remains");
      this.acceptingTranscripts = false;
      this.speech?.close();
      const count = await this.dependencies.commit(this.state.todos, this.timeZone);
      if ((this.phase as string) !== "closed") {
        this.phase = "saved";
        this.dependencies.send({ type: "committed", count });
      }
    } catch {
      if ((this.phase as string) !== "closed") {
        this.phase = "idle";
        this.state = { ...this.state, readyToCommit: false };
        this.publish();
        this.error(this.failedSegments.length ? "understanding_failed" : "save_failed", this.failedSegments.length
          ? "Retry understanding before saving. Your staged tasks are still here."
          : "The tasks could not be saved. They are still here; try Add tasks again.");
      }
    }
  }

  close() {
    this.phase = "closed";
    this.acceptingTranscripts = false;
    this.processingAbort?.abort();
    this.failedSegments = [];
    this.recentSpeech = [];
    this.speech?.close();
    this.state = createRambleSession();
  }
}
