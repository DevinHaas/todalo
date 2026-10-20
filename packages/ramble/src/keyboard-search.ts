import { defaultPreferences, effectiveBindings, type KeyboardCommand, type KeyboardPreferences, type Platform } from "./keyboard";

export type ShortcutFilter = "all" | "assigned" | "custom" | "unassigned" | "conflicts";
const keyNames: Record<string, string> = { Meta: "Command Cmd ⌘", Ctrl: "Control Ctrl", Alt: "Alt Option ⌥", Shift: "Shift ⇧", ArrowUp: "Up arrow ↑", ArrowDown: "Down arrow ↓", ArrowLeft: "Left arrow ←", ArrowRight: "Right arrow →", Escape: "Escape Esc", Backspace: "Backspace ⌫" };

export function matchesShortcut(command: KeyboardCommand, bindings: string[], query: string) {
  const keys = bindings.flatMap(binding => binding.split(/\+| then /).map(key => keyNames[key] ?? key)).join(" ");
  const text = `${command.label} ${command.group} ${bindings.join(" ")} ${keys}`.toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every(word => text.includes(word));
}

export function matchesShortcutFilter(command: KeyboardCommand, preferences: KeyboardPreferences, platform: Platform, filter: ShortcutFilter, conflictingIds: Set<string>) {
  const bindings = effectiveBindings(command.id, preferences, platform);
  switch (filter) {
    case "assigned": return bindings.length > 0;
    case "unassigned": return bindings.length === 0;
    case "custom": return JSON.stringify(bindings) !== JSON.stringify(effectiveBindings(command.id, defaultPreferences(), platform));
    case "conflicts": return conflictingIds.has(command.id);
    default: return true;
  }
}
