import { invoke, isTauri } from "@tauri-apps/api/core";
import { createRambleAudioQueue } from "@todalo/ramble/audio";
import type { RambleSessionState, RambleTodo } from "@todalo/ramble";
import { AccountTransportError, nativeAccountError } from "./errors";

/** Legacy modal phases (apps/web ramble-modal.tsx) plus the finished save. */
export type RambleStatus = "connecting" | "starting" | "listening" | "paused" | "error" | "committing" | "committed";
export interface RambleView {
  status: RambleStatus;
  /** The socket that holds the staged batch is open. */
  connected: boolean;
  /** The server's staged state (todos, capture mode); null until it arrives. */
  state: RambleSessionState | null;
  /** Finalized phrases still being understood. */
  pending: number;
  understandingFailed: boolean;
  error: string | null;
  /** Tasks saved, once status is "committed". */
  committed: number | null;
  /** The chosen microphone; "" is the system default. Kept for this screen visit only, as the legacy modal. */
  deviceId: string;
}

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

export interface RambleCommit { operationId: string; timeZone: string; todos: RambleTodo[] }

export interface RambleRecorderDependencies {
  /** Browser: same-origin URL (cookies). Native: one-use ticket URL from Rust. */
  socketUrl(): Promise<string>;
  openSocket(url: string): RambleSocket;
  capture(options: { deviceId?: string; signal: AbortSignal; onAudio: (buffer: ArrayBuffer) => void; onEnded: () => void }): Promise<{ stop(): void; deviceId?: string }>;
  startOptions(): Record<string, unknown>;
  /** Saves a batch the socket can no longer save; a replay of the same operation is a no-op. */
  commit(input: RambleCommit): Promise<number>;
  operationId(): string;
  startupTimeoutMs?: number;
  connectTimeoutMs?: number;
}

const CONNECTING = 0;
const OPEN = 1;
export const PERMISSION_DENIED = "Microphone access is off. Allow todalo to use the microphone in system settings (iPhone: Settings › todalo; Mac: System Settings › Privacy & Security › Microphone), then try again.";
export const INTERRUPTED = "Recording stopped because the microphone was interrupted or disconnected. Start again when you're ready.";
export const BACKGROUNDED = "Recording stopped when todalo left the foreground. Start again when you're ready.";
export const CONNECTION_LOST = "The voice connection was lost, so recording stopped. Start a new session to keep going.";
export const LOST_WITH_TASKS = "The voice connection was lost, so recording stopped. Your staged tasks are still here but have not been added yet. Add them, or start a new session.";
export const LOST_WITH_SPEECH = "The voice connection was lost while speech was still being understood, so that speech was not captured. The staged tasks shown are still here but have not been added yet. Add them, or start a new session.";
export const SAVE_UNCONFIRMED = "The tasks could not be confirmed as added. They are still here; try Add tasks again. Tasks that were already added will not be added twice.";

/**
 * One Ramble session (legacy ramble-modal.tsx): the socket holds the staged
 * batch, the microphone starts with it and can be paused and resumed, and
 * nothing is written before Add tasks (or a spoken "done").
 *
 * Every session has a client-generated operation ID, sent with `start`. If the
 * socket closes while a save is in flight, or before a save was asked for, the
 * batch the socket last published is saved over HTTP under that same ID, so an
 * ambiguous save is replayed rather than repeated. Success is shown only after
 * the server confirmed it.
 */
export function createRambleRecorder(dependencies: RambleRecorderDependencies, onChange: (view: RambleView) => void) {
  let deviceId = "";
  const fresh = (): RambleView => ({ status: "connecting", connected: false, state: null, pending: 0, understandingFailed: false, error: null, committed: null, deviceId });
  let view = fresh();
  const update = (next: Partial<RambleView>) => { view = { ...view, ...next }; onChange(view); };

  let generation = 0;
  let operationId = "";
  let timeZone = "UTC";
  let socket: RambleSocket | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let capture: { stop(): void } | undefined;
  let controller: AbortController | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let queue = createRambleAudioQueue();
  let ready = false;
  let started = false;
  let committing = false;

  function stopCapture() {
    clearTimeout(startTimer);
    controller?.abort();
    controller = undefined;
    capture?.stop();
    capture = undefined;
    queue.clear();
  }

  function closeSocket(discard: boolean) {
    clearInterval(heartbeat);
    clearTimeout(connectTimer);
    const current = socket;
    socket = undefined;
    if (!current) return;
    current.onopen = current.onmessage = current.onerror = current.onclose = null;
    if (discard && current.readyState === OPEN) current.send(JSON.stringify({ type: "discard" }));
    current.close();
  }

  const send = (data: string | ArrayBuffer) => {
    if (socket?.readyState !== OPEN) return false;
    socket.send(data);
    return true;
  };

  function fail(error: string) {
    stopCapture();
    update({ status: "error", error });
  }

  // Only after the microphone exists, so a permission prompt can't expire a
  // paid speech-provider connection.
  function startProvider() {
    if (started || committing || !capture || socket?.readyState !== OPEN) return;
    const options = dependencies.startOptions();
    if (typeof options.timeZone === "string") timeZone = options.timeZone;
    started = send(JSON.stringify({ type: "start", options: { ...options, operationId } }));
  }

  function onAudio(owner: AbortController, buffer: ArrayBuffer) {
    if (controller !== owner || committing) return;
    if (!ready || socket?.readyState !== OPEN) {
      if (queue.push(buffer)) return;
    } else if (socket.bufferedAmount <= 256_000) {
      socket.send(buffer);
      return;
    }
    fail("Your connection is too slow for live audio, so recording stopped. Try again.");
  }

  async function listen() {
    if (committing || view.status === "committed") return;
    stopCapture();
    const owner = new AbortController();
    controller = owner;
    update({ status: "starting", error: null });
    startTimer = setTimeout(() => {
      if (controller === owner && view.status === "starting") fail("Recording could not start in time. Check microphone permission and your connection, then try again.");
    }, dependencies.startupTimeoutMs ?? 30_000);
    try {
      const next = await dependencies.capture({
        deviceId: deviceId || undefined,
        signal: owner.signal,
        onAudio: (buffer) => onAudio(owner, buffer),
        onEnded: () => { if (controller === owner) fail(INTERRUPTED); },
      });
      if (controller !== owner) { next.stop(); return; }
      capture = next;
      // The default microphone resolves to a real device; show which one.
      if (next.deviceId) { deviceId = next.deviceId; update({ deviceId }); }
      startProvider();
      if (ready) { clearTimeout(startTimer); update({ status: "listening" }); }
    } catch (error) {
      if (controller !== owner) return;
      const name = error instanceof Error ? error.name : "";
      fail(name === "NotAllowedError" || name === "SecurityError" ? PERMISSION_DENIED
        : error instanceof Error && error.message ? error.message : "Could not start the microphone. Try again.");
    }
  }

  /** Releases the microphone; trailing silence lets the phrase in progress finalize. */
  function pauseCapture() {
    if (ready && capture) send(new ArrayBuffer(48_000));
    stopCapture();
  }

  function receive(data: unknown) {
    if (typeof data !== "string") return;
    let message: { type?: string; state?: RambleSessionState; pending?: unknown; count?: unknown; code?: string; message?: unknown };
    try { message = JSON.parse(data); } catch { fail("Ramble received an unexpected response. Start a new session."); return; }
    if (message.type === "state" && message.state) {
      update({ state: message.state });
      // A spoken "done": the server is saving.
      if (message.state.readyToCommit) { committing = true; stopCapture(); update({ status: "committing", error: null }); }
    } else if (message.type === "ready") {
      ready = true;
      queue.flush((frame) => { send(frame); });
      if (capture) { clearTimeout(startTimer); update({ status: "listening" }); }
    } else if (message.type === "processing") {
      update({ pending: typeof message.pending === "number" ? message.pending : 0 });
    } else if (message.type === "understanding_recovered") {
      update({ understandingFailed: false, error: null, status: "paused" });
    } else if (message.type === "committed") {
      committing = false;
      stopCapture();
      closeSocket(false);
      update({ status: "committed", connected: false, committed: typeof message.count === "number" ? message.count : 0 });
    } else if (message.type === "error") {
      committing = false;
      const code = message.code ?? "";
      if (code === "speech_unavailable" || code === "save_failed" || code.startsWith("understanding_")) { ready = false; started = false; }
      fail(typeof message.message === "string" && message.message ? message.message : "Ramble could not continue. Try again.");
      update({ understandingFailed: code === "understanding_failed" });
    }
  }

  function lost() {
    const saving = committing;
    stopCapture();
    closeSocket(false);
    ready = started = false;
    update({ connected: false });
    // The save may or may not have been applied: replay it under the same ID.
    if (saving) { void save(); return; }
    const lostSpeech = view.pending > 0 || view.understandingFailed;
    update({ pending: 0, understandingFailed: false });
    fail(!view.state?.todos.length ? CONNECTION_LOST : lostSpeech ? LOST_WITH_SPEECH : LOST_WITH_TASKS);
  }

  async function save() {
    const todos = view.state?.todos ?? [];
    if (!todos.length) return;
    const current = generation;
    committing = true;
    stopCapture();
    update({ status: "committing", error: null });
    try {
      const count = await dependencies.commit({ operationId, timeZone, todos });
      if (current !== generation) return;
      committing = false;
      update({ status: "committed", committed: count });
    } catch (error) {
      if (current !== generation) return;
      committing = false;
      // Definite refusals keep their reason; anything else may hide an applied save.
      const definite = error instanceof AccountTransportError && ["UNAUTHENTICATED", "PROJECT_NOT_FOUND", "INVALID_INPUT"].includes(error.code);
      fail(definite ? error.message : SAVE_UNCONFIRMED);
    }
  }

  /** Opens a new session: a new socket, operation ID and empty batch. */
  function open() {
    stopCapture();
    closeSocket(true);
    const current = ++generation;
    operationId = dependencies.operationId();
    ready = started = committing = false;
    queue = createRambleAudioQueue();
    view = fresh();
    onChange(view);
    const live = () => current === generation;
    dependencies.socketUrl().then((url) => {
      if (!live()) return;
      const next = dependencies.openSocket(url);
      next.binaryType = "arraybuffer";
      socket = next;
      connectTimer = setTimeout(() => {
        if (live() && next.readyState === CONNECTING) { closeSocket(false); fail("Ramble could not connect. Check your connection and try again."); }
      }, dependencies.connectTimeoutMs ?? 12_000);
      next.onopen = () => {
        clearTimeout(connectTimer);
        heartbeat = setInterval(() => send(JSON.stringify({ type: "ping" })), 30_000);
        update({ connected: true });
        startProvider();
      };
      next.onmessage = (event) => { if (live()) receive(event.data); };
      next.onclose = () => { if (live()) lost(); };
      next.onerror = () => {};
    }).catch((error: unknown) => {
      if (live()) fail(error instanceof Error && error.message ? error.message : "Could not connect to Ramble. Try again.");
    });
    // Permission/device startup and the authenticated socket run together.
    void listen();
  }

  return {
    open,
    /** Pause or resume listening (the session and its staged tasks stay). */
    toggle() {
      if (view.status === "listening") { pauseCapture(); update({ status: "paused" }); }
      else if (view.status !== "starting" && view.status !== "connecting") void listen();
    },
    /** Choose a microphone ("" = default); a live or failed capture restarts on it, as the legacy modal. */
    selectMicrophone(id: string) {
      deviceId = id;
      update({ deviceId });
      if (view.connected && (view.status === "listening" || view.status === "error")) void listen();
    },
    remove(id: string) { if (!committing) send(JSON.stringify({ type: "remove", id })); },
    retryUnderstanding() { send(JSON.stringify({ type: "retry-understanding" })); },
    /** Add tasks: over the socket while it is open (it flushes pending speech first), else over HTTP. */
    commit() {
      if (committing || view.status === "committed" || !view.state?.todos.length) return;
      if (!view.connected) { void save(); return; }
      if (!send(JSON.stringify({ type: "commit" }))) return;
      committing = true;
      stopCapture();
      update({ status: "committing", error: null });
    },
    /** Background/hidden or OS interruption: never keep recording; keep the batch. */
    interrupt(message = BACKGROUNDED) {
      if (view.status === "starting" || view.status === "listening") { pauseCapture(); fail(message); }
    },
    /** Discard (or leaving Ramble): abandons the batch; a save in flight is left to finish. */
    dispose() {
      stopCapture();
      closeSocket(!committing);
      generation++;
    },
    view: () => view,
  };
}

/** The HTTP save: cookie session (browser) or the Keychain bearer via one fixed native command. */
export async function commitStaged(input: RambleCommit, fetcher: typeof fetch = fetch): Promise<number> {
  if (isTauri()) {
    try { return (await invoke<{ count: number }>("ramble_commit", { commit: input })).count; }
    catch (error) { throw nativeAccountError(error); }
  }
  let response: Response;
  try {
    response = await fetcher("/api/v1/ramble/commit", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    });
  } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
  if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
  if (response.status === 404) throw new AccountTransportError("PROJECT_NOT_FOUND");
  if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
  if (!response.ok) throw new AccountTransportError("SAVE_FAILED");
  const body = await response.json().catch(() => null) as { count?: unknown } | null;
  if (typeof body?.count !== "number") throw new AccountTransportError("INVALID_RESPONSE");
  return body.count;
}
