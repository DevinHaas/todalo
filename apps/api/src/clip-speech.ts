import type { SpeechCallbacks, SpeechConnection } from "./elevenlabs";

// Turn mono PCM16/16kHz frames into bounded utterances. This gate only controls
// audio endpointing; task intent is always decided by the semantic model.
type SpeechRequest = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;
export function connectClipSpeech(callbacks: SpeechCallbacks, env = process.env, request: SpeechRequest = fetch): SpeechConnection {
  const local = env.RAMBLE_STT_PROVIDER === "local";
  const endpoint = new URL(local ? env.RAMBLE_STT_URL ?? "http://127.0.0.1:8080/inference" : "https://api.fish.audio/v1/asr");
  if (local && !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) throw new Error("Local transcription must use a loopback endpoint");
  if (local && !["http:", "https:"].includes(endpoint.protocol)) throw new Error("Invalid transcription endpoint");
  if (endpoint.username || endpoint.password) throw new Error("URL credentials are not supported");
  if (!local && !env.FISH_API_KEY) throw new Error("Fish transcription is not configured");
  const controller = new AbortController();
  let closed = false; let failed = false; let pending = Promise.resolve(); let queued = 0;
  let chunks: Uint8Array[] = []; let samples = 0; let silence = 0; let voiced = 0;

  function fail(message = "Transcription failed. Pause and try again before saving the last phrase.") {
    if (closed || failed) return;
    failed = true;
    callbacks.error(message);
  }
  function flush() {
    if (!samples) return;
    const captured = chunks; const count = samples; const speechSamples = voiced;
    chunks = []; samples = 0; silence = 0; voiced = 0;
    if (speechSamples < 3200) return;
    if (queued >= 8) { fail(); return; }
    queued += 1;
    const wav = new Uint8Array(44 + count * 2);
    const view = new DataView(wav.buffer);
    const tag = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i); };
    tag(0, "RIFF"); view.setUint32(4, wav.length - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    tag(36, "data"); view.setUint32(40, count * 2, true);
    let offset = 44; for (const bytes of captured) { wav.set(bytes, offset); offset += bytes.length; }
    pending = pending.then(async () => {
      if (closed || failed) return;
      const form = new FormData();
      form.set(local ? "file" : "audio", new Blob([wav], { type: "audio/wav" }), "utterance.wav");
      if (local) { form.set("response_format", "json"); form.set("language", "auto"); form.set("temperature", "0"); form.set("translate", "false"); }
      else { form.set("tag_audio_events", "false"); }
      const response = await request(endpoint, {
        method: "POST", body: form,
        headers: local ? {} : { authorization: `Bearer ${env.FISH_API_KEY}`, model: "transcribe-1-pro" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) {
        if (response.status === 402) fail("Your speech account needs credit. Add credit or switch to local transcription, then repeat the last phrase.");
        throw new Error("Transcription unavailable");
      }
      const result = await response.json() as { text?: unknown };
      if (typeof result.text !== "string" || result.text.length > 4000) throw new Error("Invalid transcription result");
      // Fish Pro emits speaker labels inside text; they are provider metadata,
      // not spoken words. Keep Whisper's text unchanged.
      const transcript = (local ? result.text : result.text.replace(/<\|speaker:\d+\|>/g, " ")).trim();
      if (!closed && transcript) callbacks.transcript(transcript, true);
    }).catch(() => { if (!controller.signal.aborted) fail(); }).finally(() => { queued -= 1; });
  }
  queueMicrotask(() => { if (!closed) callbacks.ready(); });
  return {
    audio(bytes) {
      if (closed || failed || bytes.length % 2) return;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let energy = 0; for (let i = 0; i < bytes.length; i += 2) energy += (view.getInt16(i, true) / 32768) ** 2;
      const length = bytes.length / 2;
      const active = length > 0 && Math.sqrt(energy / length) >= 0.008;
      if (!active && !samples) return;
      chunks.push(bytes.slice()); samples += length;
      if (active) { silence = 0; voiced += length; } else silence += length;
      if (silence >= 16000 || samples >= 16000 * 25) flush();
    },
    async finish() {
      if (closed) return;
      flush(); await pending;
      if (failed) throw new Error("Untranscribed speech remains");
    },
    close() { closed = true; controller.abort(); chunks = []; samples = 0; },
  };
}
