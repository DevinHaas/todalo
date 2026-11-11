/**
 * The app's subtle cues (public/sounds): Ramble's, and the two the user picks in Settings ›
 * General: the task-completed and Coach-opens sounds (public/sounds/<slot>/), each can be None.
 * Quiet on purpose; a blocked or missing sound is never an error. Settings › General also
 * turns them all off for this device.
 */
export type Cue = "ramble-ready" | "ramble-added" | "ramble-saved" | "complete" | "coach";
export type SoundSlot = "complete" | "coach";

/** That slot stays silent (the rest of the sounds still play). */
export const NONE = "none";

/** The choices per slot, the first being the default. Files are levelled to the same loudness. */
export const SOUND_CHOICES: Record<SoundSlot, readonly { id: string; label: string }[]> = {
  complete: [
    { id: "plop", label: "Bubble plop" }, { id: "double-plop", label: "Double bubble" }, { id: "bright-plop", label: "Bright plop" },
    { id: "soft-pop", label: "Soft pop" }, { id: "pop", label: "Pop" }, { id: "ringing-pop", label: "Ringing pop" },
    { id: "suction-pop", label: "Suction pop" }, { id: "can-open", label: "Can opening" }, { id: "click", label: "Click" },
    { id: "fizz-pop", label: "Fizz pop" }, { id: "glass", label: "Glass chime" }, { id: "completed", label: "Completed" },
    { id: "chime-1", label: "Chime 1" }, { id: "chime-2", label: "Chime 2" }, { id: "chime-3", label: "Chime 3" },
    { id: "fanfare-1", label: "Mission complete 1" }, { id: "fanfare-2", label: "Mission complete 2" }, { id: "fanfare-3", label: "Mission complete 3" },
    { id: NONE, label: "None" },
  ],
  coach: [
    { id: "magic", label: "Magic" }, { id: "magic-swell", label: "Magic swell" }, { id: "check-in", label: "Check-in" },
    { id: "bloom", label: "Bloom" }, { id: "rise", label: "Rise" }, { id: NONE, label: "None" },
  ],
};

const VOLUME: Record<Cue, number> = { "ramble-ready": 0.35, "ramble-added": 0.35, "ramble-saved": 0.35, complete: 0.5, coach: 0.4 };
const cache = new Map<string, HTMLAudioElement>();

interface PreferenceStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
const KEY = "todalo.sounds";

/** Per-device: sounds on or off (on unless turned off, like haptics) and the pick per slot. */
export function soundPreference(store: () => PreferenceStore = () => localStorage) {
  const read = (key: string) => { try { return store().getItem(key); } catch { return null; } };
  const write = (key: string, value: string) => { try { store().setItem(key, value); } catch { /* not persisted */ } };
  return {
    enabled: () => read(KEY) !== "off",
    set: (on: boolean) => write(KEY, on ? "on" : "off"),
    /** The chosen sound for a slot; an unknown or missing choice is the default. */
    choice: (slot: SoundSlot) => { const id = read(`${KEY}.${slot}`); return SOUND_CHOICES[slot].some(c => c.id === id) ? id! : SOUND_CHOICES[slot][0].id; },
    choose: (slot: SoundSlot, id: string) => write(`${KEY}.${slot}`, id),
  };
}
export const sounds = soundPreference();

/** The cue's file; null when its slot is set to None. */
const file = (cue: Cue) => {
  if (cue !== "complete" && cue !== "coach") return `/sounds/${cue}.mp3`;
  const choice = sounds.choice(cue);
  return choice === NONE ? null : `/sounds/${cue}/${choice}.mp3`;
};

export function playCue(cue: Cue) {
  if (typeof Audio === "undefined" || !sounds.enabled()) return;
  const src = file(cue);
  if (!src) return;
  let audio = cache.get(src);
  if (!audio) { audio = new Audio(src); audio.preload = "auto"; audio.volume = VOLUME[cue]; cache.set(src, audio); }
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
