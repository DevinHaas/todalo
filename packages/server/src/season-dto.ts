// Client-safe JSON contract and input rules for seasons (goals ticket 04; zod
// only, no database imports, so the shared client may import these).
import { z } from "zod";
import type { SeasonProgress } from "./season-days";

export type SeasonTier = "primary" | "secondary";
/** A goal within one season: its tier and target in words. carriedFromId is the earlier season's row (ticket 05). */
export interface SeasonGoalDto { id: string; goalId: string; title: string; archived: boolean; tier: SeasonTier; target: string; carriedFromId: string | null }
export interface SeasonDto { id: string; startDate: string; lengthDays: number; endedAt: string | null; goals: SeasonGoalDto[] }
/** The season page: the one current season with its day count in the user's zone, or null before the first. */
export interface CurrentSeasonDto { season: (SeasonDto & { progress: SeasonProgress }) | null }

export interface SeasonRecord { id: string; startDate: string; lengthDays: number; endedAt: Date | null }
export interface SeasonGoalRecord { id: string; goalId: string; title: string; archivedAt: Date | null; tier: SeasonTier; target: string; carriedFromId: string | null }

/** Lengths the season form offers besides a custom number of days. */
export const seasonLengths = { long: 84, short: 28 } as const;
/** The guideline from CONTEXT.md: more primary goals than this is warned about, never refused. */
export const primaryGuideline = 3;
export const tooManyPrimary = (goals: readonly { tier: SeasonTier }[]) => goals.filter(goal => goal.tier === "primary").length > primaryGuideline;

export const toSeasonGoalDto = (row: SeasonGoalRecord): SeasonGoalDto => ({
  id: row.id, goalId: row.goalId, title: row.title, archived: row.archivedAt !== null, tier: row.tier, target: row.target, carriedFromId: row.carriedFromId,
});
export const toSeasonDto = (season: SeasonRecord, goals: SeasonGoalRecord[]): SeasonDto => ({
  id: season.id, startDate: season.startDate, lengthDays: season.lengthDays, endedAt: season.endedAt?.toISOString() ?? null, goals: goals.map(toSeasonGoalDto),
});

// A real calendar day (no 2026-02-30); rolled-over or unparseable dates are refused.
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
});
const tier = z.enum(["primary", "secondary"]);
const target = z.string().trim().min(1).max(1_000);

export const startSeasonInput = z.object({ startDate: calendarDate, lengthDays: z.number().int().min(1).max(366) }).strict();
export const addSeasonGoalInput = z.object({ goalId: z.string().min(1).max(200), tier, target }).strict();
/** Moving the target only replaces its text (no history of targets). */
export const updateSeasonGoalInput = z.object({ tier: tier.optional(), target: target.optional() }).strict()
  .refine(patch => Object.keys(patch).length > 0, { message: "Nothing to change" });

export type StartSeasonInput = z.infer<typeof startSeasonInput>;
export type AddSeasonGoalInput = z.infer<typeof addSeasonGoalInput>;
export type UpdateSeasonGoalInput = z.infer<typeof updateSeasonGoalInput>;
