import { connectElevenLabs, type SpeechCallbacks, type SpeechConnection } from "./elevenlabs";
import { connectClipSpeech } from "./clip-speech";

export function connectSpeech(callbacks: SpeechCallbacks): SpeechConnection {
  // Streaming is the default: partial words arrive while speaking and VAD
  // commits sooner than Fish's whole-clip upload.
  const provider = process.env.RAMBLE_STT_PROVIDER ?? "elevenlabs";
  if (provider === "elevenlabs") return connectElevenLabs(callbacks);
  if (provider === "fish" || provider === "local") return connectClipSpeech(callbacks);
  throw new Error("Unsupported speech provider");
}
