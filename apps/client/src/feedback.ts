import { invoke, isTauri } from "@tauri-apps/api/core";

/** Semantic feedback events: callers say what happened, never which pattern plays. */
export type FeedbackEvent = "taskCompleted";

export interface Feedback { play(event: FeedbackEvent): void }

interface PreferenceStore { getItem(key: string): string | null; setItem(key: string, value: string): void }

const KEY = "todalo.haptics";

/** Per-device opt-out (haptics are a device feature). On unless the user turned it off. */
export function hapticsPreference(store: () => PreferenceStore = () => localStorage) {
  return {
    enabled: () => { try { return store().getItem(KEY) !== "off"; } catch { return true; } },
    set: (on: boolean) => { try { store().setItem(KEY, on ? "on" : "off"); } catch { /* not persisted */ } },
  };
}

/**
 * Fire-and-forget: feedback never throws, never awaits, and never fails the
 * operation that triggered it. Reduced motion does not silence it — a haptic
 * is not motion, and iOS applies its own System Haptics setting.
 */
export function feedback(play: (event: FeedbackEvent) => Promise<unknown>, enabled: () => boolean): Feedback {
  return {
    play: (event) => {
      try { if (enabled()) play(event).catch(() => {}); } catch { /* unsupported */ }
    },
  };
}

// ponytail: user-agent check; an iPad in desktop-site mode reports "Macintosh" and gets no toggle.
/** Standard haptics exist only in the iPhone/iPad app; web and Mac use the no-op. */
export const hapticsSupported = isTauri() && /iPhone|iPad|iPod/.test(navigator.userAgent);
export const haptics = hapticsPreference();
export const nativeFeedback = feedback(hapticsSupported ? (event) => invoke("feedback", { event }) : async () => {}, haptics.enabled);
