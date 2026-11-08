// Goals ticket 15: Goal status as a pure function (no database imports, no AI).
// Inputs: the season's dates, today, progress ratings, reached milestones and,
// per week, the goal-linked tasks completed and scheduled with their minutes
// (weekly-review.ts summarises those). Output: a weekly score series, a
// projection to the season's end and a band. Every threshold and weight lives
// in `statusRules`: they are first guesses, expect tuning after real use.
import { zonedTaskDate } from "./dates";
import { milestoneReached, type CriterionDto } from "./goal-dto";
import { addDays, type ProgressRating } from "./ritual-dto";
import { seasonProgress } from "./season-days";
import { summariseWeek, type WeekLinks, type WeekTask } from "./weekly-review";

export const statusRules = {
  /** Share of each signal in a week's score; a signal missing that week (no ratings, nothing scheduled, no milestone) drops out. */
  weights: { ratings: 0.4, kept: 0.3, work: 0.3, milestone: 0.2 },
  /** A rating as a score; Not relevant is left out. */
  ratingScores: { massive: 1, solid: 0.75, mixed: 0.5, little: 0.2 } satisfies Record<Exclude<ProgressRating, "not_relevant">, number>,
  /** Goal-linked tasks completed in a week that count as a full week of work. */
  tasksPerWeek: 3,
  /** Band floors for the recent score (0..1). */
  onTrack: 0.6,
  adjust: 0.35,
  /** "Too early" for the first days: at most this many, and at most a quarter of a short season. */
  tooEarlyDays: 7,
  /** The latest week first: how much each recent week counts in the current score. */
  recentWeights: [3, 2, 1],
  /** How much of the weekly trend carries into the projection. */
  projectionDamping: 0.5,
} as const;

export type GoalBand = "on_track" | "adjust" | "off_track" | "too_early";
export const bandLabels: Record<GoalBand, string> = { on_track: "On track", adjust: "Adjust", off_track: "Off track", too_early: "Too early" };
export interface GoalStatusDto {
  band: GoalBand;
  /** The recent score (0..1) the band is read from. */
  score: number;
  /** One score (0..1) per season week up to this one; the current week counts only its days so far. */
  weeks: number[];
  /** The score projected at the season's end (0..1). */
  projection: number;
}

/** One goal's signals in one season week. */
export interface WeekSignals {
  ratings: ProgressRating[]; completed: number; scheduledMinutes: number; keptMinutes: number; milestones: number;
  /** Share of the week's days gone (1 for a past week). */
  elapsed: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;

/** A week's score: the weighted mean of the signals present. Work is always present, so an empty week scores 0. */
export function weekScore({ ratings, completed, scheduledMinutes, keptMinutes, milestones }: WeekSignals) {
  const { weights, ratingScores, tasksPerWeek } = statusRules;
  const rated = ratings.filter((rating): rating is keyof typeof ratingScores => rating !== "not_relevant").map(rating => ratingScores[rating]);
  const parts: [number, number][] = [[weights.work, clamp(completed / tasksPerWeek)]];
  if (rated.length) parts.push([weights.ratings, rated.reduce((sum, value) => sum + value, 0) / rated.length]);
  if (scheduledMinutes > 0) parts.push([weights.kept, keptMinutes / scheduledMinutes]);
  if (milestones > 0) parts.push([weights.milestone, 1]);
  return round(parts.reduce((sum, [weight, value]) => sum + weight * value, 0) / parts.reduce((sum, [weight]) => sum + weight, 0));
}

/** The band for a recent score on season day `day` (0 before it starts) of `length`. */
export function bandOf(score: number, day: number, length: number): GoalBand {
  if (day <= Math.min(statusRules.tooEarlyDays, Math.floor(length / 4))) return "too_early";
  return score >= statusRules.onTrack ? "on_track" : score >= statusRules.adjust ? "adjust" : "off_track";
}

/** Least-squares slope of the scores per week (0 with fewer than two). */
const slopeOf = (scores: number[]) => {
  if (scores.length < 2) return 0;
  const meanX = (scores.length - 1) / 2, meanY = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const num = scores.reduce((sum, y, x) => sum + (x - meanX) * (y - meanY), 0);
  return num / scores.reduce((sum, _y, x) => sum + (x - meanX) ** 2, 0);
};

/** One goal's status from its weeks so far (oldest first), on season day `day` of `length`. */
/** `reviewed`: the season has a completed Weekly review; before it the measurement is too thin to read a band from. */
export function goalStatus({ day, length, weeks, reviewed = true }: { day: number; length: number; weeks: WeekSignals[]; reviewed?: boolean }): GoalStatusDto {
  const scores = weeks.map(weekScore);
  // Recent weeks count more; a just-started week counts only its share of days.
  const recent = weeks.map((week, index) => ({ score: scores[index]!, weight: (statusRules.recentWeights[weeks.length - 1 - index] ?? 0) * week.elapsed }));
  const total = recent.reduce((sum, item) => sum + item.weight, 0);
  const score = total ? round(recent.reduce((sum, item) => sum + item.score * item.weight, 0) / total) : 0;
  // The trend runs over finished weeks only: a just-started week reads near zero and would drag every projection down.
  const finished = scores.filter((_score, index) => weeks[index]!.elapsed >= 1);
  const projection = round(clamp(score + slopeOf(finished) * statusRules.projectionDamping * Math.max(0, length - day) / 7));
  return { band: reviewed ? bandOf(score, day, length) : "too_early", score, weeks: scores, projection };
}

/** The raw inputs for every goal of one season (rituals.ts reads them). */
export interface StatusInputs {
  links: WeekLinks; tasks: WeekTask[];
  ratings: { goalId: string; day: string; rating: ProgressRating }[];
  /** Milestone tasks; a reached one counts in the week its task was completed. */
  milestones: { goalId: string; criteria: CriterionDto[]; done: boolean; completedAt: Date | null }[];
  /** A Weekly review was completed in this season: until then every goal is Too early and the trajectory stays hidden. */
  reviewed: boolean;
}

/**
 * Each goal's status in a season starting `startDate`: weeks are 7-day runs
 * from the start (the last may be shorter), on the user's clock in `zone`;
 * the current week ends at `now`, so a scheduled task still ahead is not yet missed.
 */
export function seasonStatuses(args: SeasonArgs): Record<string, GoalStatusDto> {
  const { day, lengthDays, perGoal } = seasonSignals(args);
  return Object.fromEntries(args.goalIds.map(id => [id, goalStatus({ day, length: lengthDays, weeks: perGoal.get(id)!, reviewed: args.inputs.reviewed })]));
}

type SeasonArgs = { startDate: string; lengthDays: number; today: string; now: Date; zone: string; goalIds: string[]; inputs: StatusInputs };
/** The per-week signals behind each goal's status (ticket 17: the Coach explains them). */
export function seasonSignals({ startDate, lengthDays, today, now, zone, goalIds, inputs }: SeasonArgs) {
  const progress = seasonProgress(startDate, lengthDays, today);
  const day = progress.phase === "upcoming" ? 0 : progress.day;
  const perGoal = new Map<string, WeekSignals[]>(goalIds.map(id => [id, []]));
  for (let start = 0; start < day; start += 7) {
    const end = Math.min(start + 7, lengthDays);
    const firstDay = addDays(startDate, start), lastDay = addDays(startDate, end - 1);
    const from = zonedTaskDate(firstDay, "00:00", zone)!;
    const weekEnd = zonedTaskDate(addDays(startDate, end), "00:00", zone)!;
    const to = weekEnd < now ? weekEnd : now;
    const elapsed = Math.min(1, (day - start) / (end - start));
    const checkIns = inputs.ratings.filter(item => item.day >= firstDay && item.day <= lastDay);
    const within = (date: Date | null) => date !== null && date >= from && date < to;
    for (const week of summariseWeek({ goalIds, links: inputs.links, tasks: inputs.tasks, checkIns, from, to, zone })) {
      perGoal.get(week.goalId)!.push({
        ratings: week.checkIns.map(item => item.rating), completed: week.completed, scheduledMinutes: week.scheduledMinutes, keptMinutes: week.keptMinutes, elapsed,
        milestones: inputs.milestones.filter(item => item.goalId === week.goalId && milestoneReached(item.criteria, item.done) && within(item.completedAt)).length,
      });
    }
  }
  return { day, lengthDays, perGoal };
}
