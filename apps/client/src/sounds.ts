/**
 * Ramble's subtle cues (ElevenLabs sound effects in public/sounds): the
 * microphone is ready, a task was added, the tasks were saved. Quiet on
 * purpose; a blocked or missing sound is never an error.
 */
export type Cue = "ramble-ready" | "ramble-added" | "ramble-saved";
const VOLUME = 0.35;
const cache = new Map<Cue, HTMLAudioElement>();

export function playCue(cue: Cue) {
  if (typeof Audio === "undefined") return;
  let audio = cache.get(cue);
  if (!audio) { audio = new Audio(`/sounds/${cue}.mp3`); audio.preload = "auto"; audio.volume = VOLUME; cache.set(cue, audio); }
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
