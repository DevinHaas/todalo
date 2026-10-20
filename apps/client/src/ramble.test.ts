import { describe, expect, it, vi } from "vitest";
import type { RambleSessionState, RambleTodo } from "@todalo/ramble";
import { AccountTransportError } from "./errors";
import {
  BACKGROUNDED, CONNECTION_LOST, INTERRUPTED, LOST_WITH_SPEECH, LOST_WITH_TASKS, PERMISSION_DENIED, SAVE_UNCONFIRMED,
  commitStaged, createRambleRecorder, type RambleCommit, type RambleSocket, type RambleView,
} from "./ramble";

class FakeSocket implements RambleSocket {
  readyState = 0;
  bufferedAmount = 0;
  binaryType: BinaryType = "blob";
  sent: (string | ArrayBuffer)[] = [];
  closed = false;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string | ArrayBuffer) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(new Event("open")); }
  receive(message: object) { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent); }
  drop() { this.readyState = 3; this.onclose?.({} as CloseEvent); }
  messages() { return this.sent.filter((item): item is string => typeof item === "string").map((item) => JSON.parse(item)); }
  json() { return this.messages().map((item) => item.type).filter((type) => type !== "ping"); }
  audio() { return this.sent.filter((item): item is ArrayBuffer => item instanceof ArrayBuffer); }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = (value: number) => new Int16Array([value]).buffer;
const OPERATION = "4f9c1a2e-8d3b-4c5a-9e7f-1a2b3c4d5e6f";
const todo = (id: string, title: string): RambleTodo => ({ id, title, parentId: null, dueDate: "2026-10-16", startTime: null, endTime: null, recurrence: null, projectId: null, description: null, priority: 4, deadline: null, labelIds: [] });
const staged = (todos: RambleTodo[], readyToCommit = false) => ({ todos, mode: "top-level", parentId: null, readyToCommit } as unknown as RambleSessionState);

function setup(options: { capture?: (deviceId?: string) => Promise<{ stop(): void; deviceId?: string; analyser?: AnalyserNode }>; commit?: (input: RambleCommit) => Promise<number> } = {}) {
  const sockets: FakeSocket[] = [];
  const views: RambleView[] = [];
  const stopCapture = vi.fn();
  const commit = vi.fn(options.commit ?? (async (input: RambleCommit) => input.todos.length));
  const devices: (string | undefined)[] = [];
  let audio!: (buffer: ArrayBuffer) => void;
  let ended!: () => void;
  const recorder = createRambleRecorder({
    socketUrl: async () => "ws://api.test/api/ramble/ws?ticket=one-use",
    openSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
    capture: async ({ deviceId, onAudio, onEnded }) => {
      audio = onAudio; ended = onEnded; devices.push(deviceId);
      return options.capture ? options.capture(deviceId) : { stop: stopCapture };
    },
    startOptions: () => ({ referenceDate: "2026-10-15T09:00:00", timeZone: "Europe/Zurich", defaultDueDate: null }),
    commit,
    operationId: () => OPERATION,
  }, (view) => views.push(view));
  const socket = () => sockets.at(-1)!;
  /** Open a session that is listening with a ready provider. */
  const listening = async () => { recorder.open(); await flush(); socket().open(); socket().receive({ type: "ready" }); };
  return { recorder, devices, sockets, socket, views, stopCapture, commit, listening, audio: (buffer: ArrayBuffer) => audio(buffer), ended: () => ended(), last: () => views.at(-1)! };
}

describe("Ramble session", () => {
  it("captures from the default microphone until one is chosen, then restarts on exactly that device", async () => {
    const t = setup({ capture: async (deviceId) => ({ stop: () => {}, deviceId: deviceId ?? "built-in" }) });
    await t.listening();
    expect(t.devices).toEqual([undefined]);
    expect(t.last()).toMatchObject({ status: "listening", deviceId: "built-in" });
    t.recorder.selectMicrophone("usb"); await flush();
    expect(t.last()).toMatchObject({ status: "listening", deviceId: "usb" });
    t.recorder.toggle();
    t.recorder.selectMicrophone(""); await flush();
    t.recorder.toggle(); await flush();
    // Paused: choosing doesn't restart; the next resume uses the choice ("" = default).
    expect(t.devices).toEqual([undefined, "usb", undefined]);
  });

  it("starts the provider only after the microphone exists, with the session's operation ID, and streams frames in order", async () => {
    const t = setup();
    t.recorder.open(); await flush();
    const socket = t.socket();
    expect(socket.url).toContain("ticket=one-use");
    expect(socket.binaryType).toBe("arraybuffer");
    t.audio(frame(1)); t.audio(frame(2));
    socket.open();
    expect(socket.messages()[0]).toEqual({ type: "start", options: { referenceDate: "2026-10-15T09:00:00", timeZone: "Europe/Zurich", defaultDueDate: null, operationId: OPERATION } });
    t.audio(frame(3));
    expect(socket.audio()).toEqual([]);
    socket.receive({ type: "ready" });
    expect(t.last()).toMatchObject({ status: "listening", connected: true });
    t.audio(frame(4));
    expect(socket.audio().map((buffer) => new Int16Array(buffer)[0])).toEqual([1, 2, 3, 4]);
  });

  it("listens as soon as the microphone runs, queueing audio until the provider is ready, and meters only live capture", async () => {
    const analyser = {} as AnalyserNode;
    const t = setup({ capture: async () => ({ stop: () => {}, analyser }) });
    t.recorder.open(); await flush();
    t.socket().open();
    expect(t.last()).toMatchObject({ status: "listening", analyser });
    t.audio(frame(1));
    expect(t.socket().audio()).toEqual([]);
    t.socket().receive({ type: "ready" });
    expect(t.socket().audio().map((buffer) => new Int16Array(buffer)[0])).toEqual([1]);
    t.recorder.toggle();
    expect(t.last()).toMatchObject({ status: "paused", analyser: null });
  });

  it("shows local guesses before the model confirms them, but saves and keeps only confirmed tasks", async () => {
    const t = setup();
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk"), todo("2", "Call Anna")]), provisionalIds: ["2"] });
    expect(t.last()).toMatchObject({ provisionalIds: ["2"] });
    expect(t.last().state?.todos).toHaveLength(2);
    t.socket().drop();
    expect(t.last()).toMatchObject({ error: LOST_WITH_SPEECH, provisionalIds: [] });
    expect(t.last().state?.todos.map((item) => item.id)).toEqual(["1"]);
    t.recorder.commit(); await flush();
    expect(t.commit).toHaveBeenCalledWith({ operationId: OPERATION, timeZone: "Europe/Zurich", todos: [todo("1", "Buy milk")] });
    // A state without provisional IDs (older server) confirms everything.
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")]), provisionalIds: "bad" });
    expect(t.last().provisionalIds).toEqual([]);
  });

  it("reviews staged tasks, removes one and adds the rest over the socket; success only after the server confirms", async () => {
    const t = setup();
    await t.listening();
    t.socket().receive({ type: "processing", pending: 1 });
    expect(t.last().pending).toBe(1);
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk"), todo("2", "Call Anna")]) });
    t.socket().receive({ type: "processing", pending: 0 });
    t.recorder.remove("1");
    expect(t.socket().messages().at(-1)).toEqual({ type: "remove", id: "1" });
    t.socket().receive({ type: "state", state: staged([todo("2", "Call Anna")]) });
    t.recorder.commit();
    expect(t.socket().json().at(-1)).toBe("commit");
    expect(t.last().status).toBe("committing");
    expect(t.stopCapture).toHaveBeenCalled();
    t.recorder.commit();
    expect(t.socket().json().filter((type) => type === "commit")).toHaveLength(1);
    t.socket().receive({ type: "committed", count: 1 });
    expect(t.last()).toMatchObject({ status: "committed", committed: 1 });
    expect(t.socket().closed).toBe(true);
    expect(t.socket().json()).not.toContain("discard");
    expect(t.commit).not.toHaveBeenCalled();
  });

  it("replays a save whose answer was lost over HTTP under the same operation ID", async () => {
    const t = setup();
    await t.listening();
    // Spoken "done": the server is saving when the connection drops.
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")], true) });
    expect(t.last().status).toBe("committing");
    t.socket().drop();
    await flush();
    expect(t.commit).toHaveBeenCalledWith({ operationId: OPERATION, timeZone: "Europe/Zurich", todos: [todo("1", "Buy milk")] });
    expect(t.last()).toMatchObject({ status: "committed", committed: 1 });
  });

  it("keeps staged tasks after a lost connection and never claims an unconfirmed save", async () => {
    let attempts = 0;
    const t = setup({ commit: async () => { if (++attempts === 1) throw new AccountTransportError("CONNECTION_FAILED"); return 1; } });
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")]) });
    t.socket().drop();
    expect(t.last()).toMatchObject({ status: "error", error: LOST_WITH_TASKS, connected: false });
    expect(t.last().state?.todos).toHaveLength(1);
    t.recorder.commit(); await flush();
    expect(t.last()).toMatchObject({ status: "error", error: SAVE_UNCONFIRMED });
    expect(t.last().state?.todos).toHaveLength(1);
    t.recorder.commit(); await flush();
    expect(t.commit.mock.calls.map(([input]) => input.operationId)).toEqual([OPERATION, OPERATION]);
    expect(t.last()).toMatchObject({ status: "committed", committed: 1 });
  });

  it("says when speech still being understood was lost, and when nothing was staged", async () => {
    const t = setup();
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")]) });
    t.socket().receive({ type: "processing", pending: 1 });
    t.socket().drop();
    expect(t.last()).toMatchObject({ error: LOST_WITH_SPEECH, pending: 0 });
    await t.listening();
    expect(t.last()).toMatchObject({ state: null, error: null });
    t.socket().drop();
    expect(t.last()).toMatchObject({ error: CONNECTION_LOST });
  });

  it("pauses and resumes listening in one session, flushing the last phrase", async () => {
    const t = setup();
    await t.listening();
    t.recorder.toggle();
    expect(t.last().status).toBe("paused");
    expect(t.socket().audio().at(-1)?.byteLength).toBe(48_000);
    t.audio(frame(9));
    expect(t.socket().audio()).toHaveLength(1);
    t.recorder.toggle(); await flush();
    expect(t.last().status).toBe("listening");
    expect(t.socket().json()).toEqual(["start"]);
    expect(t.sockets).toHaveLength(1);
  });

  it("stops recording on microphone interruption and backgrounding but keeps the session and its tasks", async () => {
    const t = setup();
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")]) });
    t.ended();
    expect(t.last()).toMatchObject({ status: "error", error: INTERRUPTED, connected: true });
    expect(t.stopCapture).toHaveBeenCalledOnce();
    t.recorder.toggle(); await flush();
    expect(t.last().status).toBe("listening");
    t.recorder.interrupt();
    expect(t.last()).toMatchObject({ status: "error", error: BACKGROUNDED });
    expect(t.socket().closed).toBe(false);
    expect(t.last().state?.todos).toHaveLength(1);
  });

  it("explains a denied microphone permission and never starts a speech provider", async () => {
    const t = setup({ capture: async () => { throw new DOMException("denied", "NotAllowedError"); } });
    t.recorder.open(); await flush();
    t.socket().open();
    expect(t.last()).toMatchObject({ status: "error", error: PERMISSION_DENIED });
    expect(t.socket().json()).toEqual([]);
  });

  it("retries failed understanding, and surfaces server and ticket errors", async () => {
    const t = setup();
    await t.listening();
    t.socket().receive({ type: "error", code: "understanding_failed", message: "Task understanding failed." });
    expect(t.last()).toMatchObject({ status: "error", understandingFailed: true, error: "Task understanding failed." });
    t.recorder.retryUnderstanding();
    expect(t.socket().json().at(-1)).toBe("retry-understanding");
    t.socket().receive({ type: "understanding_recovered" });
    expect(t.last()).toMatchObject({ status: "paused", understandingFailed: false, error: null });

    const views: RambleView[] = [];
    const failing = createRambleRecorder({
      socketUrl: async () => { throw new Error("Please sign in again."); },
      openSocket: () => { throw new Error("unreachable"); },
      capture: async () => ({ stop: vi.fn() }),
      startOptions: () => ({}), commit: vi.fn(), operationId: () => OPERATION,
    }, (view) => views.push(view));
    failing.open(); await flush();
    expect(views.at(-1)).toMatchObject({ status: "error", error: "Please sign in again.", connected: false });
  });

  it("discards an unsaved batch when leaving, but never a save in flight", async () => {
    const t = setup();
    await t.listening();
    t.recorder.dispose();
    expect(t.socket().json().at(-1)).toBe("discard");
    await t.listening();
    t.socket().receive({ type: "state", state: staged([todo("1", "Buy milk")]) });
    t.recorder.commit();
    t.recorder.dispose();
    expect(t.socket().json()).not.toContain("discard");
  });
});

describe("Ramble HTTP save", () => {
  const input = { operationId: OPERATION, timeZone: "UTC", todos: [todo("1", "Buy milk")] };
  const answer = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  it("posts the batch with the cookie session and maps refusals", async () => {
    const ok = answer(200, { count: 1 });
    expect(await commitStaged(input, ok)).toBe(1);
    expect(ok).toHaveBeenCalledWith("/api/v1/ramble/commit", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify(input) }));
    for (const [status, code] of [[401, "UNAUTHENTICATED"], [404, "PROJECT_NOT_FOUND"], [400, "INVALID_INPUT"], [500, "SAVE_FAILED"]] as const) {
      await expect(commitStaged(input, answer(status))).rejects.toMatchObject({ code });
    }
    await expect(commitStaged(input, vi.fn(async () => { throw new TypeError("offline"); }))).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });
});
