import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import type { SettingsDto } from "../../../packages/server/src/settings-input";
import { change, optimistic, type Write } from "./optimistic";
import { AccountTransportError, nativeAccountError } from "./errors";

export type { SettingsDto };

/** Account preferences (ticket 12), stored server-side so they follow the account. */
export interface SettingsTransport {
  get(): Promise<SettingsDto>;
  update(settings: SettingsDto): Promise<SettingsDto>;
}

export function browserSettingsTransport(fetcher: typeof fetch = fetch): SettingsTransport {
  async function request(method: "GET" | "PATCH", body?: SettingsDto): Promise<SettingsDto> {
    let response: Response;
    try {
      response = await fetcher("/api/v1/settings", {
        method, credentials: "same-origin", cache: "no-store",
        ...(body && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "SETTINGS_UNAVAILABLE" : "SAVE_FAILED");
    return parse(await response.json().catch(() => null));
  }
  return { get: () => request("GET"), update: (settings) => request("PATCH", settings) };
}

// Only the allow-listed field reaches the cache, whatever the server adds.
function parse(body: unknown): SettingsDto {
  const value = (body as { settings?: { smartDateRecognition?: unknown } } | null)?.settings?.smartDateRecognition;
  if (typeof value !== "boolean") throw new AccountTransportError("INVALID_RESPONSE");
  return { smartDateRecognition: value };
}

export function settingsTransport(): SettingsTransport {
  if (!isTauri()) return browserSettingsTransport();
  const command = async (name: string, args?: Record<string, unknown>) => {
    try { return parse(await invoke(name, args)); }
    catch (error) { throw error instanceof AccountTransportError ? error : nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer token.
  return { get: () => command("settings"), update: (settings) => command("update_settings", { settings }) };
}

export const settingsKeys = { settings: (userId: string) => ["user", userId, "settings"] as const };

export const settingsQueries = (transport: SettingsTransport) => ({
  settings: (userId: string) => queryOptions({ queryKey: settingsKeys.settings(userId), queryFn: () => transport.get() }),
});

/**
 * The switch flips at once and rolls back if the save fails (legacy useTransition
 * waited; an optimistic flip keeps the toggle responsive on slow networks).
 * A save is idempotent, so ambiguous failures are retried like other writes.
 */
export function settingsMutations(transport: SettingsTransport, cache: QueryClient, userId: string) {
  const key = settingsKeys.settings(userId);
  return {
    update: {
      mutationFn: (settings: SettingsDto) => transport.update(settings),
      retry: (failures: number, error: unknown) => failures < 2 && error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED"),
      retryDelay: (failures: number) => 300 * 2 ** failures,
      ...optimistic<SettingsDto>(cache, { apply: (settings) => [change(key, () => settings)], refresh: () => [{ queryKey: key }] }),
      meta: { action: () => "save your preference" },
    } satisfies MutationOptions<SettingsDto, Error, SettingsDto, Write>,
  };
}
