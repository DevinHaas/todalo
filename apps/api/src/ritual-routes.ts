import { Elysia } from "elysia";
import { seasonProgress, todayIn } from "@todalo/server/season-days";
import { zonedTaskDate } from "@todalo/server/dates";
import {
  addDays, checkInDay, checkInPeriod, eveningReviewPeriod, ritualRunInput, ritualSettingsInput, weeklyReviewPeriod,
  type RitualKind, type RitualRunDto, type RitualRunInput, type RitualSettingsInput, type RitualsDto, type RunStatus, type SeasonReviewDto, type WeeklyReviewDto,
} from "@todalo/server/ritual-dto";
import type { DailyRitual, SeasonReviewInputs, StoredRitualSettings, WeekInputs } from "@todalo/server/rituals";
import { summariseWeek } from "@todalo/server/weekly-review";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface RitualStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  settings(userId: string): Promise<StoredRitualSettings>;
  save(userId: string, input: RitualSettingsInput): Promise<void>;
  runStatus(userId: string, kind: RitualKind, period: string): Promise<RunStatus | null>;
  /** null when a rated goal is missing, foreign or archived. */
  record(userId: string, input: RitualRunInput): Promise<RitualRunDto | null>;
  ritualTask(userId: string, kind: DailyRitual): Promise<{ id: string; dueDate: Date | null } | null>;
  /** Moves (or creates) a daily ritual's item (Check-in, Evening review) to start at `start`; null deletes it. Returns its ID. */
  placeRitualItem(userId: string, kind: DailyRitual, start: Date | null): Promise<string | null>;
  /** Ticket 13: one week's raw inputs (see getWeekInputs). */
  weekInputs(userId: string, week: { from: Date; to: Date; firstDay: string; lastDay: string }): Promise<WeekInputs>;
  /** Ticket 14: the current season's dates (null before the first) and the Season review's raw inputs. */
  season(userId: string): Promise<{ startDate: string; lengthDays: number } | null>;
  seasonReviewInputs(userId: string): Promise<SeasonReviewInputs>;
  /** The clock (tests pin it). */
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "A rated goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

/**
 * Rituals (goals ticket 11). Same envelope and ownership rules as the season
 * routes; "today" is the client's own day (?timeZone=). The Check-in item is
 * kept on its day here: today until today's Check-in is done or skipped, then
 * tomorrow, at the chosen time. A missed day moves it to today, never overdue.
 */
export function createRitualRoutes(store: RitualStore) {
  const writer = (request: Request) => writeUser(store, request);
  const now = store.now ?? (() => new Date());
  const zoneOf = (request: Request) => zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));

  /** One daily ritual's item for today; `force` re-places it (settings changed, or a run was recorded). */
  async function daily(userId: string, kind: DailyRitual, { settings, taskIds }: StoredRitualSettings, zone: string, today: string, period: string, force: boolean) {
    const status = await store.runStatus(userId, kind, period);
    let taskId = taskIds[kind];
    if (!settings[kind].enabled) {
      if (force) taskId = await store.placeRitualItem(userId, kind, null);
    } else {
      const day = checkInDay(today, status !== null);
      const task = await store.ritualTask(userId, kind);
      // A task the user moved later by hand stays where they put it.
      if (force || !task?.dueDate || todayIn(zone, task.dueDate) < day) taskId = await store.placeRitualItem(userId, kind, zonedTaskDate(day, settings[kind].time, zone));
      else taskId = task.id;
    }
    return { period, status, taskId };
  }

  /** Today's state; `force` re-places the daily items in `force` (settings changed, or a run was recorded). */
  async function state(userId: string, zone: string, force: readonly DailyRitual[] = []): Promise<RitualsDto> {
    const stored = await store.settings(userId);
    const today = todayIn(zone, now());
    const checkIn = await daily(userId, "checkIn", stored, zone, today, checkInPeriod(today), force.includes("checkIn"));
    const eveningReview = await daily(userId, "eveningReview", stored, zone, today, eveningReviewPeriod(today), force.includes("eveningReview"));
    const { settings } = stored;
    const week = weeklyReviewPeriod(today);
    const season = await store.season(userId);
    return {
      settings, checkIn, eveningReview, weeklyReview: { period: week, status: await store.runStatus(userId, "weeklyReview", week) },
      seasonReview: season
        ? { period: season.startDate, status: await store.runStatus(userId, "seasonReview", season.startDate), due: seasonProgress(season.startDate, season.lengthDays, today).daysLeft === 0 }
        : { period: null, status: null, due: false },
    };
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/rituals", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return state(userId, zoneOf(request));
    })
    // Ticket 13: each current-season goal's week (Monday to Sunday on the user's clock) for the Weekly review.
    .get("/rituals/weekly-review", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const zone = zoneOf(request);
      const period = weeklyReviewPeriod(todayIn(zone, now()));
      const nextWeek = addDays(period, 7);
      const from = zonedTaskDate(period, "00:00", zone)!, to = zonedTaskDate(nextWeek, "00:00", zone)!;
      const inputs = await store.weekInputs(userId, { from, to, firstDay: period, lastDay: addDays(period, 6) });
      const review = inputs.review;
      return {
        period, nextWeek, status: review?.status ?? null, ratings: review?.ratings ?? [], planning: review?.planning ?? null,
        goals: summariseWeek({ ...inputs, from, to, zone }),
      } satisfies WeeklyReviewDto;
    })
    // Ticket 14: each current-season goal's ratings across the season for the Season review's look-back.
    .get("/rituals/season-review", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const { season, goalIds, history, review } = await store.seasonReviewInputs(userId);
      return {
        seasonId: season?.id ?? null, period: season?.startDate ?? null, status: review?.status ?? null, ratings: review?.ratings ?? [],
        goals: goalIds.map(goalId => ({ goalId, history: history.filter(item => item.goalId === goalId).map(({ goalId: _, ...item }) => item).sort((a, b) => a.period.localeCompare(b.period)) })),
      } satisfies SeasonReviewDto;
    })
    .put("/rituals/settings", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = ritualSettingsInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      await store.save(userId, input.data);
      return state(userId, zoneOf(request), ["checkIn", "eveningReview"]);
    })
    // Finishing or skipping a ritual; skipping is always allowed and records nothing else.
    .post("/rituals/runs", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = ritualRunInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const run = await store.record(userId, input.data);
      if (!run) return status(404, NOT_FOUND);
      const zone = zoneOf(request);
      const today = todayIn(zone, now());
      // Today's Check-in or Evening review done or skipped: its item moves on to tomorrow.
      const moved = run.kind === "checkIn" && run.period === checkInPeriod(today) ? ["checkIn" as const]
        : run.kind === "eveningReview" && run.period === eveningReviewPeriod(today) ? ["eveningReview" as const] : [];
      const rituals = await state(userId, zone, moved);
      return status(201, { run, rituals });
    });
}
