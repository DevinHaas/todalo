/**
 * The colour mode: the `dark` class on <html>, persisted as localStorage
 * `todalo-theme` = "dark" | "light" | "system" (public/theme.js applies it before
 * first paint). System follows the OS and updates when it changes. An unset key
 * is light, as legacy (apps/web) never followed the system.
 * Settings › Appearance saves the mode with the account's design (personalization.ts).
 */
import type { DesignMode } from "../../../packages/server/src/personalization-dto";

const KEY = "todalo-theme";
type Store = Pick<Storage, "getItem" | "setItem">;
type Media = () => Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener"> | null;

const systemMedia: Media = () => typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export function themePreference(store: () => Store = () => localStorage, root: () => Element = () => document.documentElement, media: Media = systemMedia) {
  const listeners = new Set<() => void>();
  let current: DesignMode = "light";
  const dark = () => root().classList.contains("dark");
  const resolve = () => root().classList.toggle("dark", current === "dark" || (current === "system" && Boolean(media()?.matches)));
  const notify = () => listeners.forEach(listener => listener());
  // System: follow the OS while the app runs.
  const follow = () => { if (current === "system") { resolve(); notify(); } };
  const setMode = (mode: DesignMode) => {
    current = mode;
    resolve();
    try { store().setItem(KEY, mode); } catch { /* not persisted */ }
    notify();
  };
  return {
    /** Before first render (main.tsx). */
    apply: () => {
      let saved: string | null = null;
      try { saved = store().getItem(KEY); } catch { /* light */ }
      current = saved === "dark" || saved === "system" ? saved : "light";
      resolve();
      media()?.addEventListener("change", follow);
    },
    dark, mode: () => current, setMode,
    set: (on: boolean) => setMode(on ? "dark" : "light"),
    toggle: () => setMode(dark() ? "light" : "dark"),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => void listeners.delete(listener); },
  };
}

export const theme = themePreference();
