// "Use keyboard shortcuts" is generated from the app's keyboard registry, so the
// table can't drift from the defaults the app ships. Relative import: the docs
// app imports nothing else from the monorepo, and tests run under the root config.
import { keyboardCommands, type KeyboardCommand } from "../../../packages/ramble/src/keyboard";

/**
 * Registered, working commands left out of the article: the component gallery
 * (a design tool reachable from the app), and keys the client doesn't bind
 * itself (left/right focus) or that are the browser's own (Escape, paste).
 */
export const UNDOCUMENTED = new Set(["navigation.ui", "task.left", "task.right", "general.dismiss", "task.paste-file"]);

/** What the article lists: commands the app ships ("available"), minus the ones above. */
export const documentedCommands = (registry: readonly KeyboardCommand[] = keyboardCommands) =>
  registry.filter((command) => command.availability === "available" && !UNDOCUMENTED.has(command.id));

const KEY_NAMES: Record<string, string> = {
  Primary: "Mod", Meta: "Mod", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Backspace: "⌫",
};

/**
 * A registry binding in the help center's key syntax, one entry per step:
 * "Primary+Shift+r" is ["Mod+Shift+R"], "g then t" is ["G", "T"].
 */
export function helpKeys(binding: string): string[] {
  return binding.split(" then ").map((step) => step.split(/\+(?!$)/)
    .map((key) => KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)).join("+"));
}

export type ShortcutRow = { id: string; label: string; mac: string[][]; other: string[][] };

/** Rows grouped as the app's own shortcut sheet groups them, in registry order. */
export function shortcutGroups(registry: readonly KeyboardCommand[] = keyboardCommands): { group: string; rows: ShortcutRow[] }[] {
  const groups = new Map<string, ShortcutRow[]>();
  for (const command of documentedCommands(registry)) {
    const rows = groups.get(command.group) ?? [];
    rows.push({
      id: command.id, label: command.label,
      mac: (command.platformDefaults?.mac ?? command.defaults).map(helpKeys),
      other: (command.platformDefaults?.windows ?? command.defaults).map(helpKeys),
    });
    groups.set(command.group, rows);
  }
  return [...groups].map(([group, rows]) => ({ group, rows }));
}
