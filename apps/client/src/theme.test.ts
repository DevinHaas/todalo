import { describe, expect, it } from "vitest";
import { themePreference } from "./theme";

const memory = (initial?: string) => { const values = new Map<string, string>(initial ? [["todalo-theme", initial]] : []); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }; };
const element = () => { const names = new Set<string>(); return { classList: { contains: (name: string) => names.has(name), toggle: (name: string, on: boolean) => { if (on) names.add(name); else names.delete(name); return on; } } } as unknown as Element; };

describe("theme preference", () => {
  it("restores the legacy todalo-theme key; anything but dark is light", () => {
    for (const [saved, dark] of [["dark", true], ["light", false], [undefined, false], ["bogus", false]] as const) {
      const root = element();
      const pref = themePreference(() => memory(saved), () => root);
      pref.apply();
      expect(pref.dark()).toBe(dark);
    }
  });

  it("toggle flips the class, persists dark/light, and notifies subscribers", () => {
    const store = memory(); const root = element();
    const pref = themePreference(() => store, () => root);
    let calls = 0; const stop = pref.subscribe(() => calls++);
    pref.toggle();
    expect(pref.dark()).toBe(true); expect(store.values.get("todalo-theme")).toBe("dark");
    pref.toggle();
    expect(pref.dark()).toBe(false); expect(store.values.get("todalo-theme")).toBe("light");
    stop(); pref.set(true);
    expect(calls).toBe(2);
  });

  it("blocked storage still switches the theme", () => {
    const root = element(); const blocked = () => { throw new Error("blocked"); };
    const pref = themePreference(blocked, () => root);
    pref.apply(); expect(pref.dark()).toBe(false);
    pref.toggle(); expect(pref.dark()).toBe(true);
  });
});
