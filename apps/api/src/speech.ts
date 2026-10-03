import { connectElevenLabs, type SpeechCallbacks, type SpeechConnection } from "./elevenlabs";
import { connectClipSpeech } from "./clip-speech";

export function connectSpeech(callbacks: SpeechCallbacks): SpeechConnection {
  const provider = process.env.RAMBLE_STT_PROVIDER ?? "fish";
  if (provider === "elevenlabs") return connectElevenLabs(callbacks);
  if (provider === "fish" || provider === "local") return connectClipSpeech(callbacks);
  throw new Error("Unsupported speech provider");
}
