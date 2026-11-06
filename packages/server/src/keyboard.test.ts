import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPreferences, effectiveBindings } from "@todalo/ramble/keyboard";
import { KeyboardPreferencesError } from "@todalo/ramble/keyboard-account-preferences";
import { loadKeyboardPreferences, saveKeyboardPreferences } from "./keyboard";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

beforeEach(() => { boundary.rows = { user_keyboard_preferences: [{ userId: "bob", preferences: { ...defaultPreferences(), overrides: { "general.capture": ["Alt+Shift+1"] } } }] }; });

describe("account keyboard preferences", () => {
  it("loads defaults without a row and keeps each account's shortcuts separate", async () => {
    expect(await loadKeyboardPreferences("alice")).toEqual({ preferences: defaultPreferences() });
    const saved = await saveKeyboardPreferences("alice", { ...defaultPreferences(), overrides: { "general.help": ["Alt+Shift+2"] } });
    expect(effectiveBindings("general.help", saved, "mac")).toEqual(["Alt+Shift+2"]);
    const loaded = await loadKeyboardPreferences("alice");
    expect(effectiveBindings("general.help", loaded.preferences, "windows")).toEqual(["Alt+Shift+2"]);
    expect(effectiveBindings("general.help", (await loadKeyboardPreferences("bob")).preferences, "mac")).toEqual(["?"]);
    expect(boundary.rows.user_keyboard_preferences.filter(row => row.userId === "alice")).toHaveLength(1);
  });

  it("rejects conflicts, Mac-reserved keys and malformed input without writing", async () => {
    for (const input of [
      { ...defaultPreferences(), overrides: { "general.capture": ["g"] } },
      { ...defaultPreferences(), platforms: { mac: { "general.help": ["Meta+h"] } } },
      { version: 2 }, "nope",
    ]) await expect(saveKeyboardPreferences("alice", input)).rejects.toBeInstanceOf(KeyboardPreferencesError);
    expect(boundary.rows.user_keyboard_preferences.some(row => row.userId === "alice")).toBe(false);
  });

  it("reports unreadable saved shortcuts and falls back to defaults", async () => {
    boundary.rows.user_keyboard_preferences = [{ userId: "alice", preferences: { version: 9 } }];
    const loaded = await loadKeyboardPreferences("alice");
    expect(loaded.preferences).toEqual(defaultPreferences());
    expect(loaded.error).toMatch(/version/);
  });
});
