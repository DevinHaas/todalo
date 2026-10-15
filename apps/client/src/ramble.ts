import { createRambleAudioQueue } from "@todalo/ramble/audio";

export type RambleStatus = "idle" | "starting" | "listening" | "error";
export interface RambleView { status: RambleStatus; finals: string[]; partial: string; error: string | null }

export interface RambleSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: BinaryType;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export interface RambleRecorderDependencies {
  /** Browser: same-origin URL (cookies). Native: one-use ticket URL from Rust. */
  socketUrl(): Promise<string>;
  openSocket(url: string): RambleSocket;
  capture(options: { signal: AbortSignal; onAudio: (buffer: ArrayBuffer) => void; onEnded: () => void }): Promise<{ stop(): void }>;
  startOptions(): Record<string, unknown>;
  startupTimeoutMs?: number;
}

const OPEN = 1;
export const PERMISSION_DENIED = "Microphone access is off. Allow todalo to use the microphone in system settings (iPhone: Settings › todalo; Mac: System Settings › Privacy & Security › Microphone), then try again.";
export const INTERRUPTED = "Recording stopped because the microphone was interrupted or disconnected. Start again when you're ready.";
export const BACKGROUNDED = "Recording stopped when todalo left the foreground. Start again when you're ready.";
export const CONNECTION_LOST = "The voice connection was lost, so recording stopped. Start again to keep going.";

/** One short capture: microphone and socket start together, audio is queued in
 *  capture order until the speech provider is ready, then streamed in order. */
export function createRambleRecorder(dependencies: RambleRecorderDependencies, onChange: (view: RambleView) => void) {
  let view: RambleView = { status: "idle", finals: [], partial: "", error: null };
  let session: { socket?: RambleSocket; capture?: { stop(): void }; controller: AbortController; dispose(): void } | null = null;
  const update = (next: Partial<RambleView>) => { view = { ...view, ...next }; onChange(view); };

  function end(error: string | null) {
    const current = session;
    session = null;
    current?.dispose();
    if (error) update({ status: "error", error, partial: "" });
  }

  async function start() {
    end(null);
    update({ status: "starting", finals: [], partial: "", error: null });
    const controller = new AbortController();
    const queue = createRambleAudioQueue();
    let ready = false;
    let started = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => { if (session === current && view.status === "starting") end("Recording could not start in time. Check microphone permission and your connection, then try again."); }, dependencies.startupTimeoutMs ?? 30_000);
    const current: NonNullable<typeof session> = {
      controller,
      dispose() {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        controller.abort();
        queue.clear();
        current.capture?.stop();
        const socket = current.socket;
        if (socket) {
          socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
          if (socket.readyState === OPEN) socket.send(JSON.stringify({ type: "discard" }));
          socket.close();
        }
      },
    };
    session = current;
    const live = () => session === current;
    const send = (data: string | ArrayBuffer) => {
      if (current.socket?.readyState !== OPEN) return false;
      current.socket.send(data);
      return true;
    };
    // Only after the microphone exists, so a permission prompt can't expire a
    // paid speech-provider connection.
    const startProvider = () => {
      if (started || !current.capture || current.socket?.readyState !== OPEN) return;
      started = send(JSON.stringify({ type: "start", options: dependencies.startOptions() }));
    };
    const onAudio = (buffer: ArrayBuffer) => {
      if (!live() || controller.signal.aborted) return;
      if (!ready || current.socket?.readyState !== OPEN) {
        if (queue.push(buffer)) return;
      } else if (current.socket.bufferedAmount <= 256_000) {
        current.socket.send(buffer);
        return;
      }
      end("Your connection is too slow for live audio, so recording stopped. Try again.");
    };

    dependencies.socketUrl().then((url) => {
      if (!live()) return;
      const socket = dependencies.openSocket(url);
      socket.binaryType = "arraybuffer";
      current.socket = socket;
      socket.onopen = () => {
        heartbeat = setInterval(() => send(JSON.stringify({ type: "ping" })), 30_000);
        startProvider();
      };
      socket.onmessage = (event) => {
        if (!live() || typeof event.data !== "string") return;
        let message: { type?: string; text?: unknown; final?: unknown; message?: unknown };
        try { message = JSON.parse(event.data); } catch { end("Voice capture received an unexpected response. Try again."); return; }
        if (message.type === "ready") {
          ready = true;
          queue.flush((frame) => { send(frame); });
          clearTimeout(timeout);
          if (view.status === "starting") update({ status: "listening" });
        } else if (message.type === "transcript" && typeof message.text === "string") {
          if (message.final) update({ finals: message.text.trim() ? [...view.finals, message.text] : view.finals, partial: "" });
          else update({ partial: message.text });
        } else if (message.type === "error") {
          end(typeof message.message === "string" && message.message ? message.message : "Voice capture could not continue. Try again.");
        }
      };
      // After a user stop the socket may close quietly; only an active
      // recording turns a close into a visible error.
      socket.onclose = () => { if (live() && view.status !== "idle") end(CONNECTION_LOST); };
      socket.onerror = () => {};
    }).catch((error: unknown) => {
      if (live()) end(error instanceof Error && error.message ? error.message : "Could not connect to voice capture. Try again.");
    });

    try {
      const capture = await dependencies.capture({
        signal: controller.signal, onAudio,
        onEnded: () => { if (live()) end(INTERRUPTED); },
      });
      if (!live() || controller.signal.aborted) { capture.stop(); return; }
      current.capture = capture;
      startProvider();
    } catch (error) {
      if (!live() || controller.signal.aborted) return;
      const name = error instanceof Error ? error.name : "";
      end(name === "NotAllowedError" || name === "SecurityError" ? PERMISSION_DENIED
        : error instanceof Error && error.message ? error.message : "Could not start the microphone. Try again.");
    }
  }

  /** User stop: release the microphone, keep the socket for the last phrase. */
  function stop() {
    const current = session;
    if (!current) return;
    // VAD needs trailing silence to finalize the phrase in progress.
    if (view.status === "listening" && current.socket?.readyState === OPEN) current.socket.send(new ArrayBuffer(48_000));
    current.controller.abort();
    current.capture?.stop();
    update({ status: "idle" });
  }

  /** Background/hidden or OS interruption: never keep recording. */
  function interrupt(message = BACKGROUNDED) {
    if (session && (view.status === "starting" || view.status === "listening")) end(message);
  }

  return { start, stop, interrupt, dispose: () => end(null), view: () => view };
}
