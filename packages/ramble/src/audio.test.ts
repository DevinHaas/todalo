import { afterEach, describe, expect, it, vi } from "vitest";
import { createPcm16Encoder, createRambleAudioQueue, startRambleCapture } from "./audio";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("PCM16 microphone encoding", () => {
  it("downsamples 48kHz into 16kHz mono frames and clips signed PCM", () => {
    const encode = createPcm16Encoder(48000, 16000, 4);
    const frames: ArrayBuffer[] = [];
    encode(new Float32Array([1, 1, 1, -1, -1, -1, 0, 0, 0, 2, 2, 2]), (frame) => frames.push(frame));
    expect(Array.from(new Int16Array(frames[0]))).toEqual([32767, -32768, 0, 32767]);
  });

  it("preserves sample count and fractional resampling across uneven worklet quanta", () => {
    const samples = Float32Array.from({ length: 44100 }, (_, index) => Math.sin(index / 10));
    const whole: ArrayBuffer[] = [];
    const pieces: ArrayBuffer[] = [];
    createPcm16Encoder(44100)(samples, (frame) => whole.push(frame));
    const encode = createPcm16Encoder(44100);
    for (let index = 0; index < samples.length; index += 127) {
      encode(samples.slice(index, index + 127), (frame) => pieces.push(frame));
    }
    expect(pieces.length).toBe(10);
    expect(pieces.reduce((length, frame) => length + frame.byteLength, 0)).toBe(32000);
    expect(pieces.map((frame) => Array.from(new Int16Array(frame)))).toEqual(whole.map((frame) => Array.from(new Int16Array(frame))));
  });

  it("rejects unsupported sample rates", () => {
    expect(() => createPcm16Encoder(8000)).toThrow("Unsupported");
  });
});

function browserMocks() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null, getSettings: () => ({ deviceId: "mic-1" }) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  node.connect.mockReturnValue(node);
  const worklet = { ...node, port: { onmessage: null as ((event: MessageEvent) => void) | null } };
  const context = {
    state: "running" as string, onstatechange: null as (() => void) | null,
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: () => node,
    createGain: () => ({ ...node, gain: { value: 1 } }), destination: node,
    createAnalyser: () => ({ ...node, fftSize: 2048 }),
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const AudioContext = vi.fn(function () { return context; });
  const AudioWorkletNode = vi.fn(function () { return worklet; });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("window", { AudioContext });
  vi.stubGlobal("AudioContext", AudioContext);
  vi.stubGlobal("AudioWorkletNode", AudioWorkletNode);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-audio");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { track, stream, context, worklet, getUserMedia, revoke };
}

describe("microphone resource lifecycle", () => {
  it("loads the worklet while microphone permission is still pending", async () => {
    const mocks = browserMocks();
    let resolveStream!: (stream: MediaStream) => void;
    mocks.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const pending = startRambleCapture({ signal: new AbortController().signal, onAudio: vi.fn(), onEnded: vi.fn() });
    expect(mocks.context.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(mocks.context.resume).toHaveBeenCalledOnce();
    resolveStream(mocks.stream); const capture = await pending; capture.stop();
  });
  it("releases a late microphone when parallel worklet loading already failed", async () => {
    const mocks = browserMocks();
    let resolveStream!: (stream: MediaStream) => void;
    mocks.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    mocks.context.audioWorklet.addModule.mockRejectedValue(new Error("Worklet unavailable"));
    const pending = startRambleCapture({ signal: new AbortController().signal, onAudio: vi.fn(), onEnded: vi.fn() });
    await expect(pending).rejects.toThrow("Worklet unavailable");
    expect(mocks.context.close).toHaveBeenCalledOnce();
    resolveStream(mocks.stream); await Promise.resolve();
    expect(mocks.track.stop).toHaveBeenCalledOnce();
  });
  it("stops a stream acquired after the session was closed", async () => {
    const mocks = browserMocks();
    let resolveStream!: (stream: MediaStream) => void;
    mocks.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const controller = new AbortController();
    const pending = startRambleCapture({ signal: controller.signal, onAudio: vi.fn(), onEnded: vi.fn() });
    controller.abort();
    resolveStream(mocks.stream);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.track.stop).toHaveBeenCalledOnce();
    expect(mocks.context.close).toHaveBeenCalledOnce();
  });

  it("releases tracks, context and module URL if worklet startup fails", async () => {
    const mocks = browserMocks();
    mocks.context.audioWorklet.addModule.mockRejectedValue(new Error("Worklet unavailable"));
    await expect(startRambleCapture({ signal: new AbortController().signal, onAudio: vi.fn(), onEnded: vi.fn() })).rejects.toThrow("Worklet unavailable");
    expect(mocks.track.stop).toHaveBeenCalledOnce();
    expect(mocks.context.close).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith("blob:test-audio");
  });

  it("switches to an exact device and ignores queued audio after stop", async () => {
    const mocks = browserMocks();
    const onAudio = vi.fn();
    const capture = await startRambleCapture({ deviceId: "mic-1", signal: new AbortController().signal, onAudio, onEnded: vi.fn() });
    expect(mocks.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ deviceId: { exact: "mic-1" }, channelCount: 1 }) });
    const queued = mocks.worklet.port.onmessage!;
    const buffer = new ArrayBuffer(3200);
    queued({ data: { buffer } } as MessageEvent);
    expect(onAudio).toHaveBeenCalledWith(buffer);
    capture.stop();
    capture.stop();
    queued({ data: { buffer } } as MessageEvent);
    expect(onAudio).toHaveBeenCalledOnce();
    expect(mocks.track.stop).toHaveBeenCalledOnce();
    expect(mocks.context.close).toHaveBeenCalledOnce();
    expect(mocks.worklet.port.onmessage).toBeNull();
  });

  it("stops and reports once when the microphone or audio session is interrupted", async () => {
    const mocks = browserMocks();
    const onEnded = vi.fn();
    await startRambleCapture({ signal: new AbortController().signal, onAudio: vi.fn(), onEnded });
    mocks.context.state = "interrupted";
    mocks.context.onstatechange?.();
    mocks.track.onended?.();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(mocks.track.stop).toHaveBeenCalledOnce();
    expect(mocks.context.close).toHaveBeenCalledOnce();
    expect(mocks.context.onstatechange).toBeNull();
  });

  it("reports a disconnected track as an interruption", async () => {
    const mocks = browserMocks();
    const onEnded = vi.fn();
    await startRambleCapture({ signal: new AbortController().signal, onAudio: vi.fn(), onEnded });
    mocks.track.onended?.();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(mocks.context.close).toHaveBeenCalledOnce();
  });
});

describe("audio while the speech socket connects", () => {
  it("retains the first words in order and sends each frame only once", () => {
    const queue = createRambleAudioQueue(); const send = vi.fn();
    const first = new ArrayBuffer(3200); const second = new ArrayBuffer(3200);
    expect(queue.push(first)).toBe(true); expect(queue.push(second)).toBe(true);
    queue.flush(send); queue.flush(send);
    expect(send.mock.calls).toEqual([[first], [second]]);
  });
  it("bounds waiting audio without discarding earlier speech or reordering it", () => {
    const queue = createRambleAudioQueue(6400); const send = vi.fn();
    const first = new ArrayBuffer(3200); const second = new ArrayBuffer(3200);
    queue.push(first); queue.push(second);
    expect(queue.push(new ArrayBuffer(3200))).toBe(false);
    queue.flush(send); expect(send.mock.calls).toEqual([[first], [second]]);
    expect(queue.push(new ArrayBuffer(3200))).toBe(true);
  });
  it("does not send waiting audio after capture is cancelled", () => {
    const queue = createRambleAudioQueue(); const send = vi.fn();
    queue.push(new ArrayBuffer(3200)); queue.clear(); queue.flush(send);
    expect(send).not.toHaveBeenCalled();
  });
});
