import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { change, optimisticWrite } from "./optimistic";
import { localZone } from "./seasons";
import { taskKeys } from "./tasks";
import type { PlanningAnswer, ProgressRating, RatingDto, RitualKind, RitualRunDto, RitualSettingsDto, RitualsDto, RunStatus, RatingHistoryItem, SeasonReviewDto, WeekGoalSummary, WeeklyReviewDto } from "../../../packages/server/src/ritual-dto";
import { AccountTransportError, nativeAccountError } from "./errors";

export type { NotifyKind } from "../../../packages/server/src/ritual-dto";
export type { PlanningAnswer, ProgressRating, RatingDto, RitualKind, RitualRunDto, RitualSettingsDto, RitualsDto, RunStatus, RatingHistoryItem, SeasonReviewDto, WeekGoalSummary, WeeklyReviewDto };
export { addDays, progressRatings, ratingLabels, readyRituals } from "../../../packages/server/src/ritual-dto";
export interface RitualRun { kind: RitualKind; period: string; status: RunStatus; ratings: RatingDto[]; planning?: PlanningAnswer | null }

export interface RitualTransport {
  /** The settings and today's rituals in the given timezone. */
  get(timeZone: string): Promise<RitualsDto>;
  save(timeZone: string, settings: RitualSettingsDto): Promise<RitualsDto>;
  /** null when a rated goal is refused (missing, foreign or archived). */
  record(timeZone: string, run: RitualRun): Promise<{ run: RitualRunDto; rituals: RitualsDto } | null>;
  /** Ticket 13: each current-season goal's week for the Weekly review. */
  weekly(timeZone: string): Promise<WeeklyReviewDto>;
  /** Ticket 14: each current-season goal's ratings across the season. */
  seasonReview(): Promise<SeasonReviewDto>;
}

export function browserRitualTransport(fetcher: typeof fetch = fetch): RitualTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
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
  const zoned = (path: string, timeZone: string) => `${path}?${new URLSearchParams({ timeZone })}`;
  const required = <T,>(value: T | null, code: "TASKS_UNAVAILABLE" | "SAVE_FAILED") => { if (!value) throw new AccountTransportError(code); return value; };
  return {
    get: async (timeZone) => required(await request<RitualsDto>("GET", zoned("/api/v1/rituals", timeZone)), "TASKS_UNAVAILABLE"),
    save: async (timeZone, settings) => required(await request<RitualsDto>("PUT", zoned("/api/v1/rituals/settings", timeZone), settings), "SAVE_FAILED"),
    record: (timeZone, run) => request("POST", zoned("/api/v1/rituals/runs", timeZone), run),
    weekly: async (timeZone) => required(await request<WeeklyReviewDto>("GET", zoned("/api/v1/rituals/weekly-review", timeZone)), "TASKS_UNAVAILABLE"),
    seasonReview: async () => required(await request<SeasonReviewDto>("GET", "/api/v1/rituals/season-review"), "TASKS_UNAVAILABLE"),
  };
}

export function ritualTransport(): RitualTransport {
  if (!isTauri()) return browserRitualTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    get: (timeZone) => command("rituals", { timeZone }),
    save: (timeZone, settings) => command("update_ritual_settings", { timeZone, settings }),
    record: (timeZone, run) => command("record_ritual_run", { timeZone, run }),
    weekly: (timeZone) => command("weekly_review", { timeZone }),
    seasonReview: () => command("season_review"),
  };
}

/** Same convention as seasonKeys: every key starts with ["user", userId]. */
export const ritualKeys = {
  all: (userId: string) => ["user", userId, "rituals"] as const,
  /** Derived from tasks, goal links and the season too: sync.ts refreshes it on those changes. */
  weekly: (userId: string) => ["user", userId, "rituals", "weekly"] as const,
  /** Ratings per season goal; refreshed with ritual and season changes. */
  seasonReview: (userId: string) => ["user", userId, "rituals", "season-review"] as const,
};

export const ritualQueries = (transport: RitualTransport) => ({
  state: (userId: string) => queryOptions({ queryKey: ritualKeys.all(userId), queryFn: () => transport.get(localZone()) }),
  weekly: (userId: string) => queryOptions({ queryKey: ritualKeys.weekly(userId), queryFn: () => transport.weekly(localZone()) }),
  seasonReview: (userId: string) => queryOptions({ queryKey: ritualKeys.seasonReview(userId), queryFn: () => transport.seasonReview() }),
});

/**
 * Ritual writes (optimistic.ts). Saving settings flips at once; recording a
 * run marks that ritual done at once. Both refetch the tasks afterwards: the
 * server moves (or adds, or removes) the Check-in and Evening review items.
 */
export function ritualMutations(transport: RitualTransport, cache: QueryClient, userId: string) {
  const key = ritualKeys.all(userId);
  // Ratings feed Goal status (ticket 15), which rides on the current season.
  const refresh = [{ queryKey: key }, { queryKey: taskKeys.today(userId) }, { queryKey: ["user", userId, "seasons", "current"] }];
  const done = <T,>(value: T | null) => { if (!value) throw new AccountTransportError("SAVE_FAILED"); return value; };
  return {
    save: (settings: RitualSettingsDto) => optimisticWrite(cache, [change<RitualsDto | undefined>(key, data => data && { ...data, settings })],
      () => transport.save(localZone(), settings), refresh, rituals => [change(key, () => rituals)]),
    record: (run: RitualRun) => optimisticWrite(cache,
      [change<RitualsDto | undefined>(key, data => !data ? data
        : run.kind === "checkIn" && run.period === data.checkIn.period ? { ...data, checkIn: { ...data.checkIn, status: run.status } }
        : run.kind === "eveningReview" && run.period === data.eveningReview.period ? { ...data, eveningReview: { ...data.eveningReview, status: run.status } }
        : run.kind === "weeklyReview" && run.period === data.weeklyReview.period ? { ...data, weeklyReview: { ...data.weeklyReview, status: run.status } }
        : run.kind === "seasonReview" && run.period === data.seasonReview.period ? { ...data, seasonReview: { ...data.seasonReview, status: run.status } } : data),
      change<WeeklyReviewDto | undefined>(ritualKeys.weekly(userId), data => data && run.kind === "weeklyReview" && run.period === data.period
        ? { ...data, status: run.status, ratings: run.ratings, planning: run.planning ?? null } : data)],
      async () => done(await transport.record(localZone(), run)), refresh, ({ rituals }) => [change(key, () => rituals)]),
  };
}
