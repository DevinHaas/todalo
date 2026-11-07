import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CurrentSeasonDto, EndSeasonDto, PastSeasonsDto, SeasonDto, SeasonGoalDto, SeasonTier } from "../../../packages/server/src/season-dto";
import { AccountTransportError, nativeAccountError } from "./errors";

export type { CurrentSeasonDto, EndSeasonDto, PastSeasonsDto, SeasonDto, SeasonGoalDto, SeasonTier };
export { primaryGuideline, seasonLengths, tooManyPrimary } from "../../../packages/server/src/season-dto";
export interface SeasonGoalPatch { tier?: SeasonTier; target?: string }
/** The season started when the current one ends, with the goals carried into it. */
export interface NextSeason { startDate: string; lengthDays: number; goals: { goalId: string; tier: SeasonTier; target: string }[] }

export interface SeasonTransport {
  /** The current season with its day count in the given timezone; season is null before the first. */
  current(timeZone: string): Promise<CurrentSeasonDto>;
  /** Starts a season; refused (SAVE_FAILED) while another is current. */
  start(startDate: string, lengthDays: number): Promise<SeasonDto>;
  /** null when the season or goal is missing, foreign, ended or archived. */
  addGoal(seasonId: string, goalId: string, tier: SeasonTier, target: string): Promise<SeasonGoalDto | null>;
  /** Changes the tier or moves the target; null when the goal is not in the current season. */
  updateGoal(seasonId: string, goalId: string, patch: SeasonGoalPatch): Promise<SeasonGoalDto | null>;
  /** Removes the goal from the current season only; false when it is not in it. */
  removeGoal(seasonId: string, goalId: string): Promise<boolean>;
  /** Ended seasons, newest first, with their goals as history. */
  past(): Promise<SeasonDto[]>;
  /** Ends the season and, in the same operation, starts next (if given); null when the season or a carried goal is refused. */
  end(seasonId: string, next: NextSeason | null): Promise<EndSeasonDto | null>;
}

export function browserSeasonTransport(fetcher: typeof fetch = fetch): SeasonTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      // Same-origin cookie session; the API also checks Origin on writes.
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const goals = (seasonId: string) => `/api/v1/seasons/${encodeURIComponent(seasonId)}/goals`;
  const required = <T,>(value: T | null, code: "TASKS_UNAVAILABLE" | "SAVE_FAILED") => { if (!value) throw new AccountTransportError(code); return value; };
  return {
    current: async (timeZone) => required(await request<CurrentSeasonDto>("GET", `/api/v1/seasons/current?${new URLSearchParams({ timeZone })}`), "TASKS_UNAVAILABLE"),
    start: async (startDate, lengthDays) => required(await request<{ season: SeasonDto }>("POST", "/api/v1/seasons", { startDate, lengthDays }), "SAVE_FAILED").season,
    addGoal: async (seasonId, goalId, tier, target) => (await request<{ goal: SeasonGoalDto }>("POST", goals(seasonId), { goalId, tier, target }))?.goal ?? null,
    updateGoal: async (seasonId, goalId, patch) => (await request<{ goal: SeasonGoalDto }>("PATCH", `${goals(seasonId)}/${encodeURIComponent(goalId)}`, patch))?.goal ?? null,
    removeGoal: async (seasonId, goalId) => Boolean(await request("DELETE", `${goals(seasonId)}/${encodeURIComponent(goalId)}`)),
    past: async () => required(await request<PastSeasonsDto>("GET", "/api/v1/seasons/past"), "TASKS_UNAVAILABLE").seasons,
    end: (seasonId, next) => request<EndSeasonDto>("POST", `/api/v1/seasons/${encodeURIComponent(seasonId)}/end`, { next }),
  };
}

export function seasonTransport(): SeasonTransport {
  if (!isTauri()) return browserSeasonTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    current: (timeZone) => command<CurrentSeasonDto>("current_season", { timeZone }),
    start: async (startDate, lengthDays) => (await command<{ season: SeasonDto }>("start_season", { startDate, lengthDays })).season,
    addGoal: async (seasonId, goalId, tier, target) => (await command<{ goal: SeasonGoalDto } | null>("add_season_goal", { seasonId, goalId, tier, target }))?.goal ?? null,
    updateGoal: async (seasonId, goalId, patch) => (await command<{ goal: SeasonGoalDto } | null>("update_season_goal", { seasonId, goalId, patch }))?.goal ?? null,
    removeGoal: async (seasonId, goalId) => Boolean(await command<unknown>("remove_season_goal", { seasonId, goalId })),
    past: async () => (await command<PastSeasonsDto>("past_seasons")).seasons,
    end: (seasonId, next) => command<EndSeasonDto | null>("end_season", { seasonId, next }),
  };
}

/** The webview's IANA zone: the day count follows the user's own clock. */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Same convention as goalKeys: every key starts with ["user", userId]. */
export const seasonKeys = {
  all: (userId: string) => ["user", userId, "seasons"] as const,
  current: (userId: string) => ["user", userId, "seasons", "current"] as const,
  past: (userId: string) => ["user", userId, "seasons", "past"] as const,
};

export function seasonQueries(transport: SeasonTransport) {
  return {
    current: (userId: string) => queryOptions({ queryKey: seasonKeys.current(userId), queryFn: () => transport.current(localZone()) }),
    past: (userId: string) => queryOptions({ queryKey: seasonKeys.past(userId), queryFn: () => transport.past() }),
  };
}

/** Writes refresh the season page; a refused write (gone, ended or archived) is an error the page shows. */
export function seasonMutations(transport: SeasonTransport, cache: QueryClient, userId: string) {
  const stale = () => cache.invalidateQueries({ queryKey: seasonKeys.all(userId) });
  const done = <T,>(value: T | null) => { if (!value) throw new AccountTransportError("SAVE_FAILED"); return value; };
  return {
    async start(startDate: string, lengthDays: number) { try { return await transport.start(startDate, lengthDays); } finally { await stale(); } },
    async addGoal(seasonId: string, goalId: string, tier: SeasonTier, target: string) { try { return done(await transport.addGoal(seasonId, goalId, tier, target)); } finally { await stale(); } },
    /**
     * Shown at once: the server write plus the refetch took ~2 s, and until then the
     * goal stayed in its old tier section, so a tier change looked like it did nothing.
     */
    async updateGoal(seasonId: string, goalId: string, patch: SeasonGoalPatch) {
      const key = seasonKeys.current(userId);
      await cache.cancelQueries({ queryKey: key });
      const before = cache.getQueryData<CurrentSeasonDto>(key);
      if (before?.season?.id === seasonId) cache.setQueryData<CurrentSeasonDto>(key, { ...before, season: { ...before.season, goals: before.season.goals.map(goal => goal.goalId === goalId ? { ...goal, ...patch } : goal) } });
      try { return done(await transport.updateGoal(seasonId, goalId, patch)); }
      catch (error) { if (before) cache.setQueryData(key, before); throw error; }
      finally { await stale(); }
    },
    async removeGoal(seasonId: string, goalId: string) { try { return done(await transport.removeGoal(seasonId, goalId) || null); } finally { await stale(); } },
    async end(seasonId: string, next: NextSeason | null) { try { return done(await transport.end(seasonId, next)); } finally { await stale(); } },
  };
}
