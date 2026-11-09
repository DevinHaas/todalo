import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { keyboardCommands, parsePreferences, type DispatchCommand, type KeyboardCommand, type KeyboardPreferences, type Platform } from "@todalo/ramble/keyboard";
import { AccountTransportError, nativeAccountError } from "./errors";

// Ticket 19: the legacy keyboard system (registry, conflicts, recording,
// dispatcher) is the shared @todalo/ramble/keyboard*; this file adds the
// account transport and the client's DOM seams.

export interface LoadedShortcuts { preferences: KeyboardPreferences; error?: string }
export interface KeyboardTransport {
  get(): Promise<LoadedShortcuts>;
  save(preferences: KeyboardPreferences): Promise<KeyboardPreferences>;
}

// The response is re-parsed so a malformed document never reaches the dispatcher.
function parse(body: unknown): LoadedShortcuts {
  const value = body as { preferences?: unknown; error?: unknown } | null;
  try {
    return { preferences: parsePreferences(value?.preferences), ...(typeof value?.error === "string" && { error: value.error }) };
  } catch { throw new AccountTransportError("INVALID_RESPONSE"); }
}

export function browserKeyboardTransport(fetcher: typeof fetch = fetch): KeyboardTransport {
  async function request(method: "GET" | "PUT", preferences?: KeyboardPreferences): Promise<LoadedShortcuts> {
    let response: Response;
    try {
      response = await fetcher("/api/v1/settings/keyboard", {
        method, credentials: "same-origin", cache: "no-store",
        ...(preferences && { headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences }) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "SETTINGS_UNAVAILABLE" : "SAVE_FAILED");
    return parse(await response.json().catch(() => null));
  }
  return { get: () => request("GET"), save: async (preferences) => (await request("PUT", preferences)).preferences };
}

export function keyboardTransport(): KeyboardTransport {
  if (!isTauri()) return browserKeyboardTransport();
  const command = async (name: string, args?: Record<string, unknown>) => {
    try { return parse(await invoke(name, args)); }
    catch (error) { throw error instanceof AccountTransportError ? error : nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer token.
  return {
    get: () => command("keyboard_preferences"),
    save: async (preferences) => (await command("update_keyboard_preferences", { preferences })).preferences,
  };
}

export const keyboardKeys = { shortcuts: (userId: string) => ["user", userId, "keyboard"] as const };
export const keyboardQueries = (transport: KeyboardTransport) => ({
  shortcuts: (userId: string) => queryOptions({ queryKey: keyboardKeys.shortcuts(userId), queryFn: () => transport.get() }),
});

/** iPhone and iPad hardware keyboards use the Mac (Command) profile. */
export const detectPlatform = (platform = navigator.platform): Platform =>
  /Mac|iPhone|iPad/.test(platform) ? "mac" : /Linux/.test(platform) ? "linux" : "windows";

/**
 * Commands the shared client wires (keyboard-screens.tsx). Preferences are
 * account-wide, so conflicts are still checked against the whole registry;
 * help and settings list only these. Every one has a click/touch path.
 */
export const clientCommandIds = [
  "general.capture", "general.ramble", "general.sidebar", "general.help", "general.search", "general.quick-find", "general.command-palette", "general.sync",
  "navigation.today", "navigation.upcoming", "navigation.projects", "navigation.labels", "navigation.filters",
  "navigation.settings", "navigation.account", "navigation.help", "navigation.theme", "navigation.inbox", "navigation.sections",
  "task.previous", "task.next", "view.first", "view.last",
  "task.details", "task.edit", "task.complete", "task.delete", "task.select", "task.toolbar",
  "task.add-bottom", "task.add-top", "editor.submit-below", "editor.save-below", "editor.save-above", "editor.save",
  "quick-add.description", "quick-add.actions", "quick-add.deadline",
  "task.date", "task.clear-date", "task.priority-1", "task.priority-2", "task.priority-3", "task.priority-4", "task.priority",
  "task.labels", "task.deadline", "task.clear-deadline", "task.move", "task.nest", "task.unnest", "editor.previous", "editor.next",
  "navigation.ui", "goal.create", "navigation.season", "season.start", "season.add-goal", "season.move-target", "season.toggle-tier", "season.remove-goal", "season.end", "season.chart", "task.goals", "task.milestone", "task.horizon-now", "task.horizon-next", "task.horizon-later", "schedule.unscheduled", "ritual.check-in", "ritual.weekly-review", "ritual.season-review", "ritual.skip", "ritual.plan-clear", "ritual.plan-help", "ritual.evening-review", "ritual.schedule-candidate", "ritual.leave-candidate", "ritual.search-candidates", "ritual.next", "coach.settings", "coach.test", "coach.chatgpt-sign-in", "coach.chatgpt-open", "coach.chatgpt-sign-out", "coach.next-provider", "coach.draft-day", "coach.draft-week", "coach.accept-draft", "coach.decline-draft", "coach.overflow-schedule", "coach.overflow-drop", "coach.chat", "coach.bar", "coach.attach", "coach.chat-clear", "coach.planning", "coach.planning-draft", "coach.recommendation-schedule", "coach.recommendation-chat", "coach.recommendation-dismiss", "coach.learn-patterns", "season.capacity", "schedule.filter", "plan.reschedule-overdue", "plan.add-task", "schedule.task", "task.unschedule", "editor.goal-suggestion-accept", "editor.goal-suggestion-dismiss", "project.goals", "project.section", "project.menu", "project.sort-date", "project.sort-name", "project.sort-priority", "view.layout",
  "task.menu", "task.copy-url", "task.reveal", "task.toggle-children", "view.toggle-nested",
  "upcoming.today", "upcoming.next-week", "upcoming.previous-week", "calendar.today", "calendar.next-week", "calendar.previous-week",
] as const;
export type ClientCommandId = typeof clientCommandIds[number];
export const clientCommands = keyboardCommands.filter(command => (clientCommandIds as readonly string[]).includes(command.id));

/** Typing targets keep their keys (legacy isEditor). */
export function isEditable(target: EventTarget | null) {
  return typeof (target as Element | null)?.closest === "function" && Boolean((target as Element).closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}
/** An open dialog or menu owns the keyboard; only its own handlers run. */
export const modalOpen = (doc: Pick<Document, "querySelector"> = document) =>
  Boolean(doc.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'));

/** The next row in display order; ±Infinity jumps to the ends. Nothing focused starts at the near end. */
export function adjacentRow<T>(rows: T[], current: T | null, step: number): T | null {
  if (!rows.length) return null;
  const index = current === null ? -1 : rows.indexOf(current);
  if (index < 0) return step > 0 ? rows[0]! : rows[rows.length - 1]!;
  return rows[Math.max(0, Math.min(rows.length - 1, index + step))]!;
}

/**
 * List keys that also work inside the task sheet (j/k, e, Enter on its
 * sub-tasks). They pass an open dialog; their handlers decline behind any other.
 */
export const SHEET_COMMANDS: readonly ClientCommandId[] = ["task.previous", "task.next", "task.complete", "task.details", "task.edit"];
/** Settings › Coach keys (tickets 17, 18, 17c): Settings is a dialog, so they pass it; their handlers act only on Settings › Coach (switching works everywhere). */
export const SETTINGS_COMMANDS: readonly ClientCommandId[] = ["coach.test", "coach.chatgpt-sign-in", "coach.chatgpt-open", "coach.chatgpt-sign-out", "coach.next-provider", "coach.learn-patterns"];

/** Handlers become dispatcher commands with the account's effective bindings. */
export function dispatchCommands(handlers: Partial<Record<ClientCommandId, () => void | boolean>>, bindings: (id: string) => string[]): DispatchCommand[] {
  return clientCommands.flatMap(command => {
    const handle = handlers[command.id as ClientCommandId];
    // Composer and editor keys work in their fields and dialogs; their handlers decline elsewhere.
    // Sync now also works while typing or in a dialog: a browser reload there would drop the draft.
    // Ticket 23: Draft now works in the planning dialog, also from its answer field.
    const owned = command.context === "editor" || command.context === "quick-add" || command.id === "general.sync" || command.id === "coach.planning-draft";
    const sheet = SHEET_COMMANDS.includes(command.id as ClientCommandId);
    const settings = SETTINGS_COMMANDS.includes(command.id as ClientCommandId);
    // The palette also opens from a field while its keys are a chord (⌘P), so the browser never prints there.
    const chord = command.id === "general.command-palette" && bindings(command.id).every(binding => /^(Meta|Ctrl|Alt)\+/.test(binding));
    return handle ? [{ id: command.id, bindings: bindings(command.id), repeat: command.repeat, allowInEditor: owned || chord, allowInModal: owned || sheet || settings, handle }] : [];
  });
}

// Command palette (⌘P): every client command that can run here, by name.
export const PALETTE_ID = "general.command-palette";
export type PaletteScope = Record<KeyboardCommand["context"], boolean>;
export interface PaletteCommand { id: ClientCommandId; name: string; group: string }
const groupPrefix: Record<string, string> = { "Task actions": "Task" };
const pages = new Set(["navigation.inbox", "navigation.today", "navigation.upcoming", "navigation.labels", "navigation.projects", "navigation.filters", "navigation.season"]);
/** "Task: Complete task", "Navigation: Go to Inbox". */
export const paletteName = (command: KeyboardCommand) => `${groupPrefix[command.group] ?? command.group}: ${pages.has(command.id) ? `Go to ${command.label}` : command.label}`;

/**
 * The commands the palette lists: those with a handler (the same map the
 * shortcuts dispatch) whose context is active, the palette itself excluded.
 */
export function paletteCommands(handlers: Partial<Record<ClientCommandId, unknown>>, scope: PaletteScope): PaletteCommand[] {
  return clientCommands.filter(command => command.id !== PALETTE_ID && handlers[command.id as ClientCommandId] && scope[command.context])
    .map(command => ({ id: command.id as ClientCommandId, name: paletteName(command), group: command.group }));
}

/**
 * Fuzzy score of `query` in `text` (null: no match). A contiguous match beats
 * a scattered one, a word start beats mid-word, earlier beats later.
 */
export function fuzzyScore(text: string, query: string): number | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return 0;
  const t = text.toLowerCase();
  const wordStart = (at: number) => at === 0 || /[\s:&/-]/.test(t[at - 1]!);
  const at = t.indexOf(q);
  if (at >= 0) {
    // Prefer an occurrence at a word start ("inbox" in "Go to Inbox").
    let best = at;
    for (let i = at; i >= 0; i = t.indexOf(q, i + 1)) if (wordStart(i)) { best = i; break; }
    return 1000 + (wordStart(best) ? 500 : 0) - best;
  }
  let score = 0, from = 0, previous = -2;
  for (const char of q.replace(/ /g, "")) {
    const index = t.indexOf(char, from);
    if (index < 0) return null;
    score += 1 + (index === previous + 1 ? 5 : 0) + (wordStart(index) ? 3 : 0);
    previous = index; from = index + 1;
  }
  return score - t.length / 100;
}

/** Matches by name and group, best first (registry order breaks ties). */
export function rankCommands<T extends { name: string; group: string }>(commands: T[], query: string): T[] {
  if (!query.trim()) return commands;
  return commands.flatMap((command, index) => {
    const name = fuzzyScore(command.name, query); const group = fuzzyScore(command.group, query);
    const score = Math.max(name ?? -Infinity, group === null ? -Infinity : group - 1);
    return score === -Infinity ? [] : [{ command, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.command);
}

/** No query: pins in pin order, then up to 5 recent, then the rest. A query ranks everything. */
export function paletteOrder<T extends { id: string; name: string; group: string }>(commands: T[], query: string, pins: string[], recent: string[]): T[] {
  if (query.trim()) return rankCommands(commands, query);
  const byId = new Map(commands.map(command => [command.id, command]));
  const first = [...pins, ...recent.filter(id => !pins.includes(id)).slice(0, 5)].flatMap(id => byId.get(id) ?? []);
  return [...first, ...commands.filter(command => !first.includes(command))];
}

/** Pins and recent commands, per user in this browser. ponytail: localStorage; move into the account preferences if they should sync. */
export interface PaletteMemory { pins: string[]; recent: string[] }
const memoryKey = (userId: string) => `todalo:command-palette:${userId}`;
export function loadPaletteMemory(userId: string, storage: Pick<Storage, "getItem"> = localStorage): PaletteMemory {
  try {
    const value = JSON.parse(storage.getItem(memoryKey(userId)) ?? "{}") as Partial<PaletteMemory>;
    const ids = (list: unknown) => Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
    return { pins: ids(value.pins), recent: ids(value.recent).slice(0, 5) };
  } catch { return { pins: [], recent: [] }; }
}
export function savePaletteMemory(userId: string, memory: PaletteMemory, storage: Pick<Storage, "setItem"> = localStorage) {
  try { storage.setItem(memoryKey(userId), JSON.stringify(memory)); } catch { /* private mode: pins last this session */ }
}
export const rememberCommand = (memory: PaletteMemory, id: string): PaletteMemory => ({ ...memory, recent: [id, ...memory.recent.filter(item => item !== id)].slice(0, 5) });
export const togglePin = (memory: PaletteMemory, id: string): PaletteMemory => ({ ...memory, pins: memory.pins.includes(id) ? memory.pins.filter(item => item !== id) : [...memory.pins, id] });
