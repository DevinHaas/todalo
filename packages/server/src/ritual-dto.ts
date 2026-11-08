// Client-safe JSON contract, input rules and day logic for rituals (goals
// ticket 11; zod only, no database imports, so the shared client may import these).
import { z } from "zod";
import type { WeekGoalSummary } from "./weekly-review";

export type { WeekGoalSummary };

export type RitualKind = "checkIn" | "eveningReview" | "weeklyReview" | "seasonReview";
export type RunStatus = "completed" | "skipped";
/** CONTEXT.md's progress rating scale, best first. */
export const progressRatings = ["massive", "solid", "mixed", "little", "not_relevant"] as const;
export type ProgressRating = (typeof progressRatings)[number];
export const ratingLabels: Record<ProgressRating, string> = {
  massive: "A massive amount", solid: "Solid", mixed: "Mixed", little: "Little progress", not_relevant: "Not relevant",
};

/** Which rituals the user does and when. Times are HH:MM on the user's own clock. */
export interface RitualSettingsDto {
  /** Morning: plan today (ticket 14b). */
  checkIn: { enabled: boolean; time: string };
  /** Ticket 14b: evening, rate today's progress on each season goal. */
  eveningReview: { enabled: boolean; time: string };
  /** day: 0 = Sunday … 6 = Saturday. */
  weeklyReview: { enabled: boolean; day: number; time: string };
  seasonReview: { enabled: boolean };
  /** Ticket 14b: "Notify me when a ritual is ready" (default on). */
  notify: boolean;
}
/**
 * GET /api/v1/rituals: the settings, today's Check-in (it plans today; its run is
 * recorded under `period`, yesterday, as ticket 11 did), today's Evening review
 * (`period` is today) and the Weekly review due now (the week starting `period`).
 */
export interface RitualsDto {
  settings: RitualSettingsDto;
  checkIn: { period: string; status: RunStatus | null; taskId: string | null };
  eveningReview: { period: string; status: RunStatus | null; taskId: string | null };
  weeklyReview: { period: string; status: RunStatus | null };
  /**
   * Ticket 14: the current season's review (its `period` is the season's start
   * date; null without a current season). `due` from the season's last day on:
   * the review is offered then, and on demand before.
   */
  seasonReview: { period: string | null; status: RunStatus | null; due: boolean };
}
export interface RatingDto { goalId: string; rating: ProgressRating; context: string | null }
/**
 * The answer to a ritual's planning question (ticket 12): "clear" is "No, I've
 * got a clear idea"; "help" asked for help planning (by hand on the schedule
 * for now; the Coach drafts a plan from it later). null when skipped or not asked.
 */
export type PlanningAnswer = "clear" | "help";
export interface RitualRunDto { id: string; kind: RitualKind; period: string; status: RunStatus; ratings: RatingDto[]; planning: PlanningAnswer | null }

/**
 * GET /api/v1/rituals/weekly-review (ticket 13): the week starting `period`
 * (Monday) per current-season goal, the week's own run if any, and `nextWeek`
 * (the Monday the planning step shows).
 */
export interface WeeklyReviewDto {
  period: string; nextWeek: string; status: RunStatus | null; ratings: RatingDto[]; planning: PlanningAnswer | null;
  goals: WeekGoalSummary[];
}

/** One earlier rating of a goal in the season: an Evening review's (or an old Check-in's) day or a Weekly review's Monday. */
export interface RatingHistoryItem { kind: "checkIn" | "eveningReview" | "weeklyReview"; period: string; rating: ProgressRating; context: string | null }
/**
 * GET /api/v1/rituals/season-review (ticket 14): the current season's review run
 * if any, and per season goal its completed ratings in the season, oldest first.
 * seasonId is null without a current season.
 */
export interface SeasonReviewDto {
  seasonId: string | null; period: string | null; status: RunStatus | null; ratings: RatingDto[];
  goals: { goalId: string; history: RatingHistoryItem[] }[];
}

export const defaultRitualSettings: RitualSettingsDto = {
  checkIn: { enabled: false, time: "09:00" }, eveningReview: { enabled: false, time: "20:00" }, weeklyReview: { enabled: false, day: 0, time: "17:00" }, seasonReview: { enabled: false }, notify: true,
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});

export const ritualSettingsInput = z.object({
  checkIn: z.object({ enabled: z.boolean(), time }).strict(),
  eveningReview: z.object({ enabled: z.boolean(), time }).strict(),
  weeklyReview: z.object({ enabled: z.boolean(), day: z.number().int().min(0).max(6), time }).strict(),
  seasonReview: z.object({ enabled: z.boolean() }).strict(),
  notify: z.boolean(),
}).strict();

/**
 * Finishing or skipping one ritual for one period. Recording the same kind and
 * period again replaces it (a replay or a redo), ratings and planning answer
 * included. A skip has neither.
 */
export const ritualRunInput = z.object({
  kind: z.enum(["checkIn", "eveningReview", "weeklyReview", "seasonReview"]),
  period: calendarDate,
  status: z.enum(["completed", "skipped"]),
  ratings: z.array(z.object({
    goalId: z.string().min(1).max(200),
    rating: z.enum(progressRatings),
    context: z.string().trim().max(5_000).nullable().optional().transform(value => value || null),
  }).strict()).max(100).refine(items => new Set(items.map(item => item.goalId)).size === items.length, { message: "Duplicate goal" }),
  planning: z.enum(["clear", "help"]).nullable().optional().transform(value => value ?? null),
}).strict().refine(run => run.status === "completed" || (run.ratings.length === 0 && run.planning === null), { message: "A skipped ritual has no ratings or planning answer" })
  .refine(run => run.kind !== "weeklyReview" || mondayOf(run.period) === run.period, { message: "A Weekly review's period is the Monday starting its week" });

export type RitualSettingsInput = z.infer<typeof ritualSettingsInput>;
export type RitualRunInput = z.infer<typeof ritualRunInput>;

/** Calendar-day arithmetic on YYYY-MM-DD strings (no timezone involved). */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday starting the week that contains `day`. */
export function mondayOf(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * The week a Weekly review held on `today` reviews: the Monday-to-Sunday week
 * most of which has passed (Thursday to Sunday review this week, Monday to
 * Wednesday the last one), so a Sunday and a Monday review both look back.
 */
export const weeklyReviewPeriod = (today: string) => mondayOf(addDays(today, -3));

/**
 * The period a Check-in held on `today` is recorded under: yesterday (ticket
 * 11 rated yesterday; kept so existing runs stay one per day). Since ticket
 * 14b it plans today and carries no ratings.
 */
export const checkInPeriod = (today: string) => addDays(today, -1);

/** Ticket 14b: the Evening review reflects on the day it is held. */
export const eveningReviewPeriod = (today: string) => today;

/** Ticket 14b: the rituals that notify when ready (the Season review is offered in the app only). */
export type NotifyKind = "checkIn" | "eveningReview" | "weeklyReview";
/**
 * Ticket 14b: which rituals are ready at `time` (HH:MM) on `weekday` (0 =
 * Sunday) on the user's clock: on, their time reached today (the Weekly review
 * only on its day), and not done or skipped for their period. None while
 * notifications are off. The caller keeps it to one notification per period.
 */
export function readyRituals({ settings, checkIn, eveningReview, weeklyReview }: Pick<RitualsDto, "settings" | "checkIn" | "eveningReview" | "weeklyReview">, time: string, weekday: number) {
  if (!settings.notify) return [];
  const ready: { kind: NotifyKind; period: string }[] = [];
  if (settings.checkIn.enabled && time >= settings.checkIn.time && !checkIn.status) ready.push({ kind: "checkIn", period: checkIn.period });
  if (settings.eveningReview.enabled && time >= settings.eveningReview.time && !eveningReview.status) ready.push({ kind: "eveningReview", period: eveningReview.period });
  if (settings.weeklyReview.enabled && weekday === settings.weeklyReview.day && time >= settings.weeklyReview.time && !weeklyReview.status) ready.push({ kind: "weeklyReview", period: weeklyReview.period });
  return ready;
}

/**
 * The day a daily ritual's item (Check-in, Evening review) belongs on: today until today's Check-in is done
 * or skipped, then tomorrow. A missed day is never carried as overdue: the item
 * moves to today (rituals carry no penalty).
 */
export const checkInDay = (today: string, doneToday: boolean) => doneToday ? addDays(today, 1) : today;
