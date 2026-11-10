import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient, type QueryFilters } from "@tanstack/react-query";
import { change, optimisticWrite } from "./optimistic";
import { goalKeys, type GoalsDto } from "./goals";
import type { CurrentSeasonDto, EndSeasonDto, PastSeasonsDto, SeasonDto, SeasonGoalDto, SeasonTier } from "../../../packages/server/src/season-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { CapacityDto } from "../../../packages/server/src/coach-suggestions";
import { reportCoachError } from "./coach-errors";

export type { CapacityDto, CurrentSeasonDto, EndSeasonDto, PastSeasonsDto, SeasonDto, SeasonGoalDto, SeasonTier };
export { primaryGuideline, seasonLengths, tooManyPrimary } from "../../../packages/server/src/season-dto";
export type { GoalBand, GoalStatusDto } from "../../../packages/server/src/goal-status";
export { bandLabels, statusRules } from "../../../packages/server/src/goal-status";
export interface SeasonGoalPatch { tier?: SeasonTier; target?: string }
/** The season started when the current one ends, with the goals carried into it. */
export interface NextSeason { startDate: string; lengthDays: number; goals: { goalId: string; tier: SeasonTier; target: string }[] }

/** The season setup's starting point of one goal: where it stands today, in the user's words. */
export interface StartingPoint { baseline?: string }

export interface SeasonTransport {
  /** The current season with its day count in the given timezone; season is null before the first. */
  current(timeZone: string): Promise<CurrentSeasonDto>;
  /** Starts a season; refused (SAVE_FAILED) while another is current. */
  start(startDate: string, lengthDays: number, intention?: string): Promise<SeasonDto>;
  /** null when the season or goal is missing, foreign, ended or archived. */
  addGoal(seasonId: string, goalId: string, tier: SeasonTier, target: string, start?: StartingPoint): Promise<SeasonGoalDto | null>;
  /** Changes the tier or moves the target; null when the goal is not in the current season. */
  updateGoal(seasonId: string, goalId: string, patch: SeasonGoalPatch): Promise<SeasonGoalDto | null>;
  /** Removes the goal from the current season only; false when it is not in it. */
  removeGoal(seasonId: string, goalId: string): Promise<boolean>;
  /** Ended seasons, newest first, with their goals as history. */
  past(): Promise<SeasonDto[]>;
  /** Ends the season and, in the same operation, starts next (if given); null when the season or a carried goal is refused. */
  end(seasonId: string, next: NextSeason | null): Promise<EndSeasonDto | null>;
  /** Ticket 25: the Coach's estimate of the primary goals' weekly time against the time available. */
  capacity(): Promise<CapacityDto>;
  /** Saves the minutes a week available for primary goals (null clears it). */
  saveCapacity(availableMinutes: number | null): Promise<CapacityDto>;
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
    start: async (startDate, lengthDays, intention) => required(await request<{ season: SeasonDto }>("POST", "/api/v1/seasons", { startDate, lengthDays, intention }), "SAVE_FAILED").season,
    addGoal: async (seasonId, goalId, tier, target, start) => (await request<{ goal: SeasonGoalDto }>("POST", goals(seasonId), { goalId, tier, target, ...start }))?.goal ?? null,
    updateGoal: async (seasonId, goalId, patch) => (await request<{ goal: SeasonGoalDto }>("PATCH", `${goals(seasonId)}/${encodeURIComponent(goalId)}`, patch))?.goal ?? null,
    removeGoal: async (seasonId, goalId) => Boolean(await request("DELETE", `${goals(seasonId)}/${encodeURIComponent(goalId)}`)),
    past: async () => required(await request<PastSeasonsDto>("GET", "/api/v1/seasons/past"), "TASKS_UNAVAILABLE").seasons,
    end: (seasonId, next) => request<EndSeasonDto>("POST", `/api/v1/seasons/${encodeURIComponent(seasonId)}/end`, { next }),
    capacity: async () => required(await request<CapacityDto>("GET", "/api/v1/coach/capacity"), "TASKS_UNAVAILABLE"),
    saveCapacity: async (availableMinutes) => required(await request<CapacityDto>("PUT", "/api/v1/coach/capacity", { availableMinutes }), "SAVE_FAILED"),
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
    start: async (startDate, lengthDays, intention) => (await command<{ season: SeasonDto }>("start_season", { startDate, lengthDays, intention })).season,
    addGoal: async (seasonId, goalId, tier, target, start) => (await command<{ goal: SeasonGoalDto } | null>("add_season_goal", { seasonId, goalId, tier, target, ...start }))?.goal ?? null,
    updateGoal: async (seasonId, goalId, patch) => (await command<{ goal: SeasonGoalDto } | null>("update_season_goal", { seasonId, goalId, patch }))?.goal ?? null,
    removeGoal: async (seasonId, goalId) => Boolean(await command<unknown>("remove_season_goal", { seasonId, goalId })),
    past: async () => (await command<PastSeasonsDto>("past_seasons")).seasons,
    end: (seasonId, next) => command<EndSeasonDto | null>("end_season", { seasonId, next }),
    capacity: () => command<CapacityDto>("season_capacity"),
    saveCapacity: (availableMinutes) => command<CapacityDto>("save_capacity", { availableMinutes }),
  };
}

/** The webview's IANA zone: the day count follows the user's own clock. */
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Same convention as goalKeys: every key starts with ["user", userId]. */
export const seasonKeys = {
  all: (userId: string) => ["user", userId, "seasons"] as const,
  current: (userId: string) => ["user", userId, "seasons", "current"] as const,
  past: (userId: string) => ["user", userId, "seasons", "past"] as const,
  // Under "seasons": a tier or target change refetches it (the server re-asks only when the primary goals changed).
  capacity: (userId: string) => ["user", userId, "seasons", "capacity"] as const,
};

export function seasonQueries(transport: SeasonTransport) {
  return {
    current: (userId: string) => queryOptions({ queryKey: seasonKeys.current(userId), queryFn: () => transport.current(localZone()) }),
    past: (userId: string) => queryOptions({ queryKey: seasonKeys.past(userId), queryFn: () => transport.past() }),
    capacity: (userId: string) => queryOptions({ queryKey: seasonKeys.capacity(userId), queryFn: () => transport.capacity().then(result => { reportCoachError(result.error, { background: true }); return result; }) }),
  };
}

/**
 * Season writes. Adding, changing and removing a season goal show at once
 * (optimistic.ts) and a failure takes back only that change: the server write
 * plus the refetch took ~2 s, and until then a tier change looked like it did
 * nothing. Starting and ending wait for the server, which computes the dates,
 * progress and carried goals. A refused write (gone, ended or archived) is an error.
 */
export function seasonMutations(transport: SeasonTransport, cache: QueryClient, userId: string) {
  const refresh: QueryFilters[] = [{ queryKey: seasonKeys.all(userId) }];
  const done = <T,>(value: T | null) => { if (!value) throw new AccountTransportError("SAVE_FAILED"); return value; };
  const rows = (seasonId: string, edit: (goals: SeasonGoalDto[]) => SeasonGoalDto[]) => change<CurrentSeasonDto | undefined>(seasonKeys.current(userId),
    data => data?.season?.id === seasonId ? { ...data, season: { ...data.season, goals: edit(data.season.goals) } } : data);
  const settled = async <T,>(run: () => Promise<T>) => { try { return await run(); } finally { await cache.invalidateQueries({ queryKey: seasonKeys.all(userId) }); } };
  return {
    start: (startDate: string, lengthDays: number, intention?: string) => settled(() => transport.start(startDate, lengthDays, intention)),
    addGoal(seasonId: string, goalId: string, tier: SeasonTier, target: string, start?: StartingPoint) {
      const goal = cache.getQueryData<GoalsDto>(goalKeys.list(userId))?.goals.find(item => item.id === goalId);
      const draft: SeasonGoalDto = { id: `draft-${goalId}`, goalId, title: goal?.title ?? "", color: goal?.color ?? "blue", icon: goal?.icon ?? "target", archived: false, tier, target, carriedFromId: null, baseline: start?.baseline ?? null };
      return optimisticWrite(cache, [rows(seasonId, goals => [...goals.filter(item => item.goalId !== goalId), draft])], async () => done(await transport.addGoal(seasonId, goalId, tier, target, start)), refresh,
        added => [rows(seasonId, goals => goals.map(item => item.goalId === goalId ? added : item))]);
    },
    updateGoal(seasonId: string, goalId: string, patch: SeasonGoalPatch) {
      return optimisticWrite(cache, [rows(seasonId, goals => goals.map(goal => goal.goalId === goalId ? { ...goal, ...patch } : goal))], async () => done(await transport.updateGoal(seasonId, goalId, patch)), refresh);
    },
    removeGoal(seasonId: string, goalId: string) {
      return optimisticWrite(cache, [rows(seasonId, goals => goals.filter(goal => goal.goalId !== goalId))], async () => done(await transport.removeGoal(seasonId, goalId) || null), refresh);
    },
    end: (seasonId: string, next: NextSeason | null) => settled(async () => done(await transport.end(seasonId, next))),
  };
}
