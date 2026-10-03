import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectElevenLabs } from "./elevenlabs";

class FakeSocket {
  static latest: FakeSocket;
  bufferedAmount = 0;
  sent: string[] = [];
  listeners = new Map<string, ((event: { data?: string }) => void)[]>();
  constructor(readonly url: string, readonly options: { headers: Record<string, string> }) { FakeSocket.latest = this; }
  addEventListener(type: string, callback: (event: { data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }
  emit(type: string, data?: object) {
    for (const callback of this.listeners.get(type) ?? []) callback({ data: data ? JSON.stringify(data) : undefined });
  }
  send(data: string) { this.sent.push(data); }
  close() { this.emit("close"); }
}

describe("ElevenLabs server bridge", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("WebSocket", FakeSocket); vi.stubEnv("ELEVENLABS_API_KEY", "test-server-key"); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  function connect() {
    const callbacks = { ready: vi.fn(), transcript: vi.fn(), error: vi.fn() };
    const connection = connectElevenLabs(callbacks);
    return { ...callbacks, connection, socket: FakeSocket.latest };
  }
  it("keeps the credential in server headers and frames ready PCM with VAD", () => {
    const h = connect();
    const url = new URL(h.socket.url);
    expect(url.searchParams.get("audio_format")).toBe("pcm_16000");
    expect(url.searchParams.get("commit_strategy")).toBe("vad");
    expect(h.socket.url).not.toContain("test-server-key");
    expect(h.socket.options.headers["xi-api-key"]).toBe("test-server-key");
    h.connection.audio(new Uint8Array([0, 1])); expect(h.socket.sent).toHaveLength(0);
    h.socket.emit("message", { message_type: "session_started" });
    expect(h.ready).toHaveBeenCalledOnce();
    h.connection.audio(new Uint8Array([0, 1]));
    expect(JSON.parse(h.socket.sent[0])).toEqual({ message_type: "input_audio_chunk", audio_base_64: "AAE=", sample_rate: 16000 });
    h.connection.close();
  });
  it("streams partial and final segments once, ignoring delayed timestamp events", () => {
    const h = connect();
    h.socket.emit("message", { message_type: "partial_transcript", text: "buy" });
    h.socket.emit("message", { message_type: "committed_transcript", text: "buy milk" });
    h.socket.emit("message", { message_type: "committed_transcript_with_timestamps", text: "buy milk" });
    expect(h.transcript.mock.calls).toEqual([["buy", false], ["buy milk", true]]);
    h.connection.close();
    h.socket.emit("message", { message_type: "committed_transcript", text: "late" });
    expect(h.transcript).toHaveBeenCalledTimes(2);
  });
  it("flushes silence, waits for the final transcript, and refuses to lose a pending phrase", async () => {
    const h = connect(); h.socket.emit("message", { message_type: "session_started" });
    h.socket.emit("message", { message_type: "partial_transcript", text: "pending" });
    const flush = h.connection.finish();
    expect(Buffer.from(JSON.parse(h.socket.sent[0]).audio_base_64, "base64")).toHaveLength(48_000);
    h.socket.emit("message", { message_type: "committed_transcript", text: "pending task" });
    await expect(flush).resolves.toBeUndefined();
    h.socket.emit("message", { message_type: "partial_transcript", text: "another pending" });
    const unfinished = expect(h.connection.finish()).rejects.toThrow("not finished");
    await vi.advanceTimersByTimeAsync(2200); await unfinished;
    h.connection.close();
  });
  it("sanitizes provider errors, handles backpressure, and times out startup", async () => {
    const h = connect();
    h.socket.emit("message", { message_type: "auth_error", error: "private account detail test-server-key" });
    expect(h.error.mock.calls[0][0]).not.toContain("private");
    expect(h.error.mock.calls[0][0]).not.toContain("test-server-key");
    expect(h.error).toHaveBeenCalledOnce();
    const slow = connect(); slow.socket.emit("message", { message_type: "session_started" });
    slow.socket.bufferedAmount = 600_000; slow.connection.audio(new Uint8Array(3200));
    expect(slow.error).toHaveBeenCalledWith(expect.stringContaining("too slow"));
    const timeout = connect(); await vi.advanceTimersByTimeAsync(15_000);
    expect(timeout.error).toHaveBeenCalledWith(expect.stringContaining("too long"));
  });
});
