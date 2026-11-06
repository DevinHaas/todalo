// Server-only season operations for /api/v1 (goals ticket 04). Every read and
// write is scoped to the owner; ended seasons (ticket 05) are history and
// refuse writes like missing ones.
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@todalo/db";
import { goals, seasonGoals, seasons } from "@todalo/db/schema";
import type { AddSeasonGoalInput, SeasonGoalRecord, SeasonRecord, StartSeasonInput, UpdateSeasonGoalInput } from "./season-dto";

const seasonColumns = { id: seasons.id, startDate: seasons.startDate, lengthDays: seasons.lengthDays, endedAt: seasons.endedAt };
const goalColumns = {
  id: seasonGoals.id, goalId: seasonGoals.goalId, title: goals.title, archivedAt: goals.archivedAt,
  tier: seasonGoals.tier, target: seasonGoals.target, carriedFromId: seasonGoals.carriedFromId,
};

const currentSeason = async (userId: string, id?: string) => {
  const [season] = await db.select(seasonColumns).from(seasons)
    .where(and(eq(seasons.userId, userId), isNull(seasons.endedAt), id === undefined ? undefined : eq(seasons.id, id))).limit(1);
  return season ?? null;
};

const goalsOf = (userId: string, seasonId: string, goalId?: string): Promise<SeasonGoalRecord[]> => db.select(goalColumns).from(seasonGoals)
  .innerJoin(goals, eq(goals.id, seasonGoals.goalId))
  .where(and(eq(seasonGoals.userId, userId), eq(seasonGoals.seasonId, seasonId), goalId === undefined ? undefined : eq(seasonGoals.goalId, goalId)))
  .orderBy(asc(seasonGoals.createdAt), asc(seasonGoals.id));

/** The one current season and its goals in the order they were added; null before the first. */
export async function getCurrentSeason(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null> {
  const season = await currentSeason(userId);
  return season && { season, goals: await goalsOf(userId, season.id) };
}

/** null while another season is current: the partial unique index on seasons enforces one per user. */
export async function startSeason(userId: string, input: StartSeasonInput): Promise<SeasonRecord | null> {
  const [season] = await db.insert(seasons).values({ userId, ...input }).onConflictDoNothing().returning(seasonColumns);
  return season ?? null;
}

/**
 * null when the season is missing, foreign or ended, or the goal is missing,
 * foreign or archived; "exists" when the goal is already in the season.
 */
export async function addSeasonGoal(userId: string, seasonId: string, input: AddSeasonGoalInput): Promise<SeasonGoalRecord | "exists" | null> {
  const [season, [goal]] = await Promise.all([
    currentSeason(userId, seasonId),
    db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, input.goalId), eq(goals.userId, userId), isNull(goals.archivedAt))).limit(1),
  ]);
  if (!season || !goal) return null;
  const [row] = await db.insert(seasonGoals).values({ userId, seasonId, ...input }).onConflictDoNothing().returning({ id: seasonGoals.id });
  if (!row) return "exists";
  return (await goalsOf(userId, seasonId, input.goalId))[0] ?? null;
}

/** Changes the tier or replaces the target text; null when the season is missing, foreign or ended, or the goal is not in it. */
export async function updateSeasonGoal(userId: string, seasonId: string, goalId: string, patch: UpdateSeasonGoalInput): Promise<SeasonGoalRecord | null> {
  if (!await currentSeason(userId, seasonId)) return null;
  const [row] = await db.update(seasonGoals).set(patch)
    .where(and(eq(seasonGoals.userId, userId), eq(seasonGoals.seasonId, seasonId), eq(seasonGoals.goalId, goalId))).returning({ id: seasonGoals.id });
  if (!row) return null;
  return (await goalsOf(userId, seasonId, goalId))[0] ?? null;
}
