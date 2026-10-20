import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import { keyboardCommands, parsePreferences, type DispatchCommand, type KeyboardPreferences, type Platform } from "@todalo/ramble/keyboard";
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
  "general.capture", "general.ramble", "general.sidebar", "general.help", "general.search", "general.quick-find",
  "navigation.today", "navigation.upcoming", "navigation.projects", "navigation.labels", "navigation.filters",
  "navigation.settings", "navigation.account", "navigation.help", "navigation.theme",
  "task.previous", "task.next", "view.first", "view.last",
  "task.details", "task.edit", "task.complete", "task.delete", "task.select", "task.toolbar",
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

/** Handlers become dispatcher commands with the account's effective bindings. */
export function dispatchCommands(handlers: Partial<Record<ClientCommandId, () => void | boolean>>, bindings: (id: string) => string[]): DispatchCommand[] {
  return clientCommands.flatMap(command => {
    const handle = handlers[command.id as ClientCommandId];
    return handle ? [{ id: command.id, bindings: bindings(command.id), repeat: command.repeat, handle }] : [];
  });
}
