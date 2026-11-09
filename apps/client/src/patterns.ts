import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CoachPatternsDto, PatternDto } from "../../../packages/server/src/coach-patterns";
import { AccountTransportError, nativeAccountError } from "./errors";
import { localZone } from "./seasons";

export type { CoachPatternsDto, PatternDto };
export { STATEMENT_MAX } from "../../../packages/server/src/coach-patterns";

/** Goals ticket 24: the Coach's Patterns (Settings › Coach). */
export interface PatternTransport {
  list(): Promise<CoachPatternsDto>;
  /** One model call over this season; `learned` 0 with `message` when it added none. */
  learn(timeZone: string): Promise<CoachPatternsDto>;
  update(id: string, statement: string): Promise<CoachPatternsDto>;
  remove(id: string): Promise<CoachPatternsDto>;
}

const noProvider = (patterns: CoachPatternsDto["patterns"] = []): CoachPatternsDto => ({ patterns, learned: 0, message: "Connect an AI provider first in Settings › Coach." });
const gone = new AccountTransportError("SAVE_FAILED");

export function browserPatternTransport(fetcher: typeof fetch = fetch): PatternTransport {
  async function request(method: string, path: string, body?: unknown): Promise<CoachPatternsDto | null> {
    let response: Response;
    try {
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 404) return null;
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as CoachPatternsDto; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const path = (id: string) => `/api/v1/coach/patterns/${encodeURIComponent(id)}`;
  return {
    list: async () => (await request("GET", "/api/v1/coach/patterns")) ?? { patterns: [] },
    learn: async (timeZone) => (await request("POST", `/api/v1/coach/patterns/learn?${new URLSearchParams({ timeZone })}`)) ?? noProvider(),
    update: async (id, statement) => { const result = await request("PATCH", path(id), { statement }); if (!result) throw gone; return result; },
    remove: async (id) => { const result = await request("DELETE", path(id)); if (!result) throw gone; return result; },
  };
}

export function patternTransport(): PatternTransport {
  if (!isTauri()) return browserPatternTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  const decided = async (run: Promise<CoachPatternsDto | null>) => { const result = await run; if (!result) throw gone; return result; };
  // Fixed native commands; Rust attaches the Keychain bearer.
  return {
    list: () => command("coach_patterns"),
    learn: async (timeZone) => (await command<CoachPatternsDto | null>("learn_coach_patterns", { timeZone })) ?? noProvider(),
    update: (id, statement) => decided(command("update_coach_pattern", { id, statement })),
    remove: (id) => decided(command("delete_coach_pattern", { id })),
  };
}

export const patterns = patternTransport();
export const patternKeys = { all: (userId: string) => ["user", userId, "coach", "patterns"] as const };
export const patternQuery = (userId: string) => queryOptions({ queryKey: patternKeys.all(userId), queryFn: () => patterns.list() });

/** Every write puts the list it returns in the cache; learning also refreshes the Coach texts that read patterns. */
export function patternMutations(cache: QueryClient, userId: string) {
  const put = (result: CoachPatternsDto) => { cache.setQueryData(patternKeys.all(userId), { patterns: result.patterns }); return result; };
  return {
    learn: async () => {
      const result = put(await patterns.learn(localZone()));
      if (result.learned) await cache.invalidateQueries({ queryKey: ["user", userId, "coach"], predicate: query => query.queryKey[3] !== "patterns" });
      return result;
    },
    update: async ({ id, statement }: { id: string; statement: string }) => put(await patterns.update(id, statement)),
    remove: async (id: string) => put(await patterns.remove(id)),
  };
}
