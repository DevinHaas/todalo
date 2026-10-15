import { describe, expect, it, vi } from "vitest";
import { BACKGROUNDED, CONNECTION_LOST, INTERRUPTED, PERMISSION_DENIED, createRambleRecorder, type RambleSocket, type RambleView } from "./ramble";

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
  json() { return this.sent.filter((item): item is string => typeof item === "string").map((item) => JSON.parse(item).type); }
  audio() { return this.sent.filter((item): item is ArrayBuffer => item instanceof ArrayBuffer); }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const frame = (value: number) => new Int16Array([value]).buffer;

function setup(capture?: () => Promise<{ stop(): void }>) {
  const sockets: FakeSocket[] = [];
  const views: RambleView[] = [];
  const stopCapture = vi.fn();
  let audio!: (buffer: ArrayBuffer) => void;
  let ended!: () => void;
  const recorder = createRambleRecorder({
    socketUrl: async () => "ws://api.test/api/ramble/ws?ticket=one-use",
    openSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
    capture: async ({ onAudio, onEnded }) => {
      audio = onAudio; ended = onEnded;
      return capture ? capture() : { stop: stopCapture };
    },
    startOptions: () => ({ referenceDate: "2026-10-15T09:00:00", timeZone: "Europe/Zurich" }),
  }, (view) => views.push(view));
  return { recorder, sockets, views, stopCapture, audio: (buffer: ArrayBuffer) => audio(buffer), ended: () => ended(), last: () => views.at(-1)! };
}

describe("Ramble recorder", () => {
  it("starts the provider only after the microphone exists, then streams frames in capture order", async () => {
    const t = setup();
    const starting = t.recorder.start();
    await starting; await flush();
    const socket = t.sockets[0];
    expect(socket.url).toContain("ticket=one-use");
    expect(socket.binaryType).toBe("arraybuffer");
    t.audio(frame(1)); t.audio(frame(2));
    socket.open();
    expect(socket.json()).toEqual(["start"]);
    t.audio(frame(3));
    expect(socket.audio()).toEqual([]);
    socket.receive({ type: "ready" });
    expect(t.last().status).toBe("listening");
    t.audio(frame(4));
    expect(socket.audio().map((buffer) => new Int16Array(buffer)[0])).toEqual([1, 2, 3, 4]);
  });

  it("shows partial then final transcription and keeps the socket for the last phrase after stop", async () => {
    const t = setup();
    await t.recorder.start(); await flush();
    const socket = t.sockets[0];
    socket.open(); socket.receive({ type: "ready" });
    socket.receive({ type: "transcript", text: "buy mi", final: false });
    expect(t.last()).toMatchObject({ partial: "buy mi", finals: [] });
    t.recorder.stop();
    expect(t.stopCapture).toHaveBeenCalledOnce();
    expect(socket.audio().at(-1)?.byteLength).toBe(48_000);
    expect(socket.closed).toBe(false);
    t.audio(frame(9));
    expect(socket.audio()).toHaveLength(1);
    socket.receive({ type: "transcript", text: "buy milk", final: true });
    expect(t.last()).toMatchObject({ status: "idle", finals: ["buy milk"], partial: "", error: null });
    socket.drop();
    expect(t.last().status).toBe("idle");
  });

  it("explains a denied microphone permission and never opens a speech provider", async () => {
    const t = setup(async () => { throw new DOMException("denied", "NotAllowedError"); });
    await t.recorder.start(); await flush();
    expect(t.last()).toMatchObject({ status: "error", error: PERMISSION_DENIED });
    expect(t.sockets[0].closed).toBe(true);
    expect(t.sockets[0].json()).toEqual([]);
  });

  it("stops visibly and releases everything on microphone interruption, backgrounding and socket loss", async () => {
    const t = setup();
    await t.recorder.start(); await flush();
    t.sockets[0].open(); t.sockets[0].receive({ type: "ready" });
    t.ended();
    expect(t.last()).toMatchObject({ status: "error", error: INTERRUPTED });
    expect(t.stopCapture).toHaveBeenCalledOnce();
    expect(t.sockets[0].json()).toEqual(["start", "discard"]);
    expect(t.sockets[0].closed).toBe(true);

    await t.recorder.start(); await flush();
    expect(t.last()).toMatchObject({ status: "starting", error: null, finals: [] });
    t.recorder.interrupt();
    expect(t.last()).toMatchObject({ status: "error", error: BACKGROUNDED });
    expect(t.sockets[1].closed).toBe(true);

    await t.recorder.start(); await flush();
    t.sockets[2].open(); t.sockets[2].receive({ type: "ready" });
    t.sockets[2].drop();
    expect(t.last()).toMatchObject({ status: "error", error: CONNECTION_LOST });
    expect(t.stopCapture).toHaveBeenCalledTimes(3);
  });

  it("surfaces server and ticket errors and stops capture", async () => {
    const t = setup();
    await t.recorder.start(); await flush();
    t.sockets[0].open();
    t.sockets[0].receive({ type: "error", code: "speech_unavailable", message: "Voice capture is unavailable." });
    expect(t.last()).toMatchObject({ status: "error", error: "Voice capture is unavailable." });
    expect(t.stopCapture).toHaveBeenCalledOnce();

    const views: RambleView[] = [];
    const failing = createRambleRecorder({
      socketUrl: async () => { throw new Error("Please sign in again."); },
      openSocket: () => { throw new Error("unreachable"); },
      capture: async () => ({ stop: vi.fn() }),
      startOptions: () => ({}),
    }, (view) => views.push(view));
    await failing.start(); await flush();
    expect(views.at(-1)).toMatchObject({ status: "error", error: "Please sign in again." });
  });
});
