import { describe, expect, it, vi } from "vitest";
import { connectClipSpeech } from "./clip-speech";

const pcm = (seconds: number, value: number) => {
  const bytes = new Uint8Array(Math.round(seconds * 16000) * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < bytes.length; i += 2) view.setInt16(i, value, true);
  return bytes;
};
const callbacks = () => ({ ready: vi.fn(), transcript: vi.fn(), error: vi.fn() });
describe("clip transcription", () => {
  it("skips silence and sends voiced PCM as multilingual WAV to loopback Whisper", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ text: "Call Anna" }));
    const cb = callbacks(); const speech = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "local" }, request);
    speech.audio(pcm(1, 0)); await speech.finish(); expect(request).not.toHaveBeenCalled();
    speech.audio(pcm(.4, 4000)); speech.audio(pcm(1, 0)); await speech.finish();
    expect(cb.transcript).toHaveBeenCalledWith("Call Anna", true);
    const [url, options] = request.mock.calls[0]; expect(String(url)).toBe("http://127.0.0.1:8080/inference");
    const form = options?.body as FormData; expect(form.get("language")).toBe("auto"); expect(form.get("translate")).toBe("false");
    const wav = new Uint8Array(await (form.get("file") as Blob).arrayBuffer());
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF"); expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
    speech.close();
  });
  it("serializes Fish phrases with a server-only credential and flushes speech before save", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ text: "<|speaker:0|>Buy milk" }));
    const cb = callbacks(); const speech = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "fish", FISH_API_KEY: "test-secret" }, request);
    speech.audio(pcm(.5, 3000)); speech.audio(pcm(1, 0)); speech.audio(pcm(.4, 3000)); await speech.finish();
    expect(request).toHaveBeenCalledTimes(2); expect(cb.transcript).toHaveBeenCalledTimes(2);
    expect(cb.transcript).toHaveBeenNthCalledWith(1, "Buy milk", true);
    expect(request.mock.calls[0][1]?.headers).toEqual({ authorization: "Bearer test-secret", model: "transcribe-1-pro" });
    expect((request.mock.calls[0][1]?.body as FormData).has("audio")).toBe(true);
    expect((request.mock.calls[0][1]?.body as FormData).get("tag_audio_events")).toBe("false");
    speech.close();
  });
  it("ignores Fish speaker-only output without removing bracketed spoken content", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ text: "<|speaker:0|>" }))
      .mockResolvedValueOnce(Response.json({ text: "<|speaker:12|> Read [chapter 2]" }));
    const cb = callbacks(); const speech = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "fish", FISH_API_KEY: "test-secret" }, request);
    speech.audio(pcm(.4, 3000)); await speech.finish(); expect(cb.transcript).not.toHaveBeenCalled();
    speech.audio(pcm(.4, 3000)); await speech.finish();
    expect(cb.transcript).toHaveBeenCalledExactlyOnceWith("Read [chapter 2]", true); speech.close();
  });
  it("refuses to save after transcription failure and cancels late responses on discard", async () => {
    const cb = callbacks(); const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private details", { status: 429 }));
    const speech = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "local" }, request);
    speech.audio(pcm(.5, 3000)); await expect(speech.finish()).rejects.toThrow("Untranscribed");
    expect(cb.error).toHaveBeenCalledTimes(1); expect(cb.error.mock.calls[0][0]).not.toContain("private"); speech.close();
    let resolve!: (value: Response) => void;
    const delayed = vi.fn<typeof fetch>().mockImplementation(() => new Promise((done) => { resolve = done; }));
    const discarded = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "local" }, delayed);
    discarded.audio(pcm(.5, 3000)); const finishing = discarded.finish(); await Promise.resolve(); discarded.close();
    resolve(Response.json({ text: "Late task" })); await finishing; expect(cb.transcript).not.toHaveBeenCalled();
    expect(delayed.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("rejects missing Fish keys and remote local endpoints", () => {
    expect(() => connectClipSpeech(callbacks(), { RAMBLE_STT_PROVIDER: "fish" })).toThrow("not configured");
    expect(() => connectClipSpeech(callbacks(), { RAMBLE_STT_PROVIDER: "local", RAMBLE_STT_URL: "https://remote.example/inference" })).toThrow("loopback");
  });
  it("reports exhausted speech credit clearly and blocks saving untranscribed speech", async () => {
    const cb = callbacks(); const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("account details", { status: 402 }));
    const speech = connectClipSpeech(cb, { RAMBLE_STT_PROVIDER: "fish", FISH_API_KEY: "test-secret" }, request);
    speech.audio(pcm(.5, 3000)); await expect(speech.finish()).rejects.toThrow("Untranscribed");
    expect(cb.error).toHaveBeenCalledTimes(1); expect(cb.error.mock.calls[0][0]).toContain("needs credit");
    expect(cb.transcript).not.toHaveBeenCalled(); speech.close();
  });
});
