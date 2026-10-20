/**
 * Legacy theme (apps/web keyboard-provider "navigation.theme"): the `dark` class
 * on <html>, persisted as localStorage `todalo-theme` = "dark" | "light".
 * Legacy never follows the system preference, so an unset key is light.
 */
const KEY = "todalo-theme";
type Store = Pick<Storage, "getItem" | "setItem">;

export function themePreference(store: () => Store = () => localStorage, root: () => Element = () => document.documentElement) {
  const listeners = new Set<() => void>();
  const dark = () => root().classList.contains("dark");
  const set = (on: boolean) => {
    root().classList.toggle("dark", on);
    try { store().setItem(KEY, on ? "dark" : "light"); } catch { /* not persisted */ }
    listeners.forEach(listener => listener());
  };
  return {
    /** Before first render (main.tsx). */
    apply: () => { let saved = null; try { saved = store().getItem(KEY); } catch { /* light */ } root().classList.toggle("dark", saved === "dark"); },
    dark, set,
    toggle: () => set(!dark()),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => void listeners.delete(listener); },
  };
}

export const theme = themePreference();
