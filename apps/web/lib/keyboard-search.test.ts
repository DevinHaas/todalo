import { describe, expect, it } from "vitest";
import { defaultPreferences, keyboardCommands } from "./keyboard";
import { matchesShortcut, matchesShortcutFilter } from "./keyboard-search";

describe("shortcut search and assignment filters", () => {
  const command = keyboardCommands.find(item => item.id === "general.ramble")!;
  it("searches actions, groups, effective bindings and human key names", () => {
    for (const query of ["ramble", "general", "Meta+Shift+r", "command shift", "⌘", "  OPEN ramble  "]) {
      expect(matchesShortcut(command, ["Meta+Shift+r"], query), query).toBe(true);
    }
    expect(matchesShortcut(command, ["Alt+x"], "command")).toBe(false);
    expect(matchesShortcut(command, ["Meta+Shift+r"], "no matching action")).toBe(false);
  });
  it("classifies empty assignments and custom bindings using the selected platform", () => {
    const preferences = defaultPreferences();
    preferences.platforms.mac = { [command.id]: [] };
    expect(matchesShortcutFilter(command, preferences, "mac", "unassigned", new Set())).toBe(true);
    expect(matchesShortcutFilter(command, preferences, "mac", "assigned", new Set())).toBe(false);
    expect(matchesShortcutFilter(command, preferences, "mac", "custom", new Set())).toBe(true);
    expect(matchesShortcutFilter(command, preferences, "windows", "custom", new Set())).toBe(false);
    expect(matchesShortcutFilter(command, preferences, "windows", "assigned", new Set())).toBe(true);
    expect(matchesShortcutFilter(command, preferences, "mac", "conflicts", new Set([command.id]))).toBe(true);
  });
});
