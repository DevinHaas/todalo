// Client-safe JSON contract, input rules and day logic for rituals (goals
// ticket 11; zod only, no database imports, so the shared client may import these).
import { z } from "zod";

export type RitualKind = "checkIn" | "weeklyReview" | "seasonReview";
export type RunStatus = "completed" | "skipped";
/** CONTEXT.md's progress rating scale, best first. */
export const progressRatings = ["massive", "solid", "mixed", "little", "not_relevant"] as const;
export type ProgressRating = (typeof progressRatings)[number];
export const ratingLabels: Record<ProgressRating, string> = {
  massive: "A massive amount", solid: "Solid", mixed: "Mixed", little: "Little progress", not_relevant: "Not relevant",
};

/** Which rituals the user does and when. Times are HH:MM on the user's own clock. */
export interface RitualSettingsDto {
  checkIn: { enabled: boolean; time: string };
  /** day: 0 = Sunday … 6 = Saturday. */
  weeklyReview: { enabled: boolean; day: number; time: string };
  seasonReview: { enabled: boolean };
}
/** GET /api/v1/rituals: the settings and today's Check-in (it reflects on `period`, yesterday). */
export interface RitualsDto {
  settings: RitualSettingsDto;
  checkIn: { period: string; status: RunStatus | null; taskId: string | null };
}
export interface RatingDto { goalId: string; rating: ProgressRating; context: string | null }
export interface RitualRunDto { id: string; kind: RitualKind; period: string; status: RunStatus; ratings: RatingDto[] }

export const defaultRitualSettings: RitualSettingsDto = {
  checkIn: { enabled: false, time: "09:00" }, weeklyReview: { enabled: false, day: 0, time: "17:00" }, seasonReview: { enabled: false },
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});

export const ritualSettingsInput = z.object({
  checkIn: z.object({ enabled: z.boolean(), time }).strict(),
  weeklyReview: z.object({ enabled: z.boolean(), day: z.number().int().min(0).max(6), time }).strict(),
  seasonReview: z.object({ enabled: z.boolean() }).strict(),
}).strict();

/**
 * Finishing or skipping one ritual for one period. Recording the same kind and
 * period again replaces it (a replay or a redo), ratings included. A skip has no ratings.
 */
export const ritualRunInput = z.object({
  kind: z.enum(["checkIn", "weeklyReview", "seasonReview"]),
  period: calendarDate,
  status: z.enum(["completed", "skipped"]),
  ratings: z.array(z.object({
    goalId: z.string().min(1).max(200),
    rating: z.enum(progressRatings),
    context: z.string().trim().max(5_000).nullable().optional().transform(value => value || null),
  }).strict()).max(100).refine(items => new Set(items.map(item => item.goalId)).size === items.length, { message: "Duplicate goal" }),
}).strict().refine(run => run.status === "completed" || run.ratings.length === 0, { message: "A skipped ritual has no ratings" });

export type RitualSettingsInput = z.infer<typeof ritualSettingsInput>;
export type RitualRunInput = z.infer<typeof ritualRunInput>;

/** Calendar-day arithmetic on YYYY-MM-DD strings (no timezone involved). */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The day a Check-in held on `today` reflects on. */
export const checkInPeriod = (today: string) => addDays(today, -1);

/**
 * The day the Check-in item belongs on: today until today's Check-in is done
 * or skipped, then tomorrow. A missed day is never carried as overdue: the item
 * moves to today (rituals carry no penalty).
 */
export const checkInDay = (today: string, doneToday: boolean) => doneToday ? addDays(today, 1) : today;
