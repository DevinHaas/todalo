// Server-only season operations for /api/v1 (goals ticket 04). Every read and
// write is scoped to the owner; ended seasons (ticket 05) are history and
// refuse writes like missing ones.
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@todalo/db";
import { goals, seasonGoals, seasons } from "@todalo/db/schema";
import type { AddSeasonGoalInput, EndSeasonInput, SeasonGoalRecord, SeasonRecord, StartSeasonInput, UpdateSeasonGoalInput } from "./season-dto";

const seasonColumns = { id: seasons.id, startDate: seasons.startDate, lengthDays: seasons.lengthDays, intention: seasons.intention, endedAt: seasons.endedAt };
const goalColumns = {
  id: seasonGoals.id, goalId: seasonGoals.goalId, title: goals.title, color: goals.color, icon: goals.icon, archivedAt: goals.archivedAt,
  tier: seasonGoals.tier, target: seasonGoals.target, baseline: seasonGoals.baseline, carriedFromId: seasonGoals.carriedFromId,
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

/** Removes only the goal's row in the current season (the goal and earlier seasons stay); false when missing, foreign or ended. */
export async function removeSeasonGoal(userId: string, seasonId: string, goalId: string): Promise<boolean> {
  if (!await currentSeason(userId, seasonId)) return false;
  const [row] = await db.delete(seasonGoals)
    .where(and(eq(seasonGoals.userId, userId), eq(seasonGoals.seasonId, seasonId), eq(seasonGoals.goalId, goalId))).returning({ id: seasonGoals.id });
  return Boolean(row);
}

/** Ended seasons newest first, each with its goals, tiers and targets as they were. */
export async function listPastSeasons(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] }[]> {
  const past = await db.select(seasonColumns).from(seasons).where(and(eq(seasons.userId, userId), isNotNull(seasons.endedAt)))
    .orderBy(desc(seasons.startDate), desc(seasons.endedAt));
  if (!past.length) return [];
  // ponytail: whole history in one read; page it if users ever have hundreds of seasons.
  const rows = await db.select({ ...goalColumns, seasonId: seasonGoals.seasonId }).from(seasonGoals)
    .innerJoin(goals, eq(goals.id, seasonGoals.goalId))
    .where(and(eq(seasonGoals.userId, userId), inArray(seasonGoals.seasonId, past.map(season => season.id))))
    .orderBy(asc(seasonGoals.createdAt), asc(seasonGoals.id));
  return past.map(season => ({ season, goals: rows.filter(row => row.seasonId === season.id).map(({ seasonId: _, ...goal }) => goal) }));
}

/**
 * Ends the current season, keeping its rows as history, and optionally starts
 * the next with the carried goals (fresh tier and target, carriedFromId set)
 * in one transaction. null when the season is missing, foreign or ended, or a
 * carried goal is not in it or archived.
 */
export async function endSeason(userId: string, seasonId: string, { next }: EndSeasonInput): Promise<{
  ended: { season: SeasonRecord; goals: SeasonGoalRecord[] }; next: { season: SeasonRecord; goals: SeasonGoalRecord[] } | null;
} | null> {
  const season = await currentSeason(userId, seasonId);
  if (!season) return null;
  const history = await goalsOf(userId, seasonId);
  const from = new Map(history.map(row => [row.goalId, row]));
  if (next?.goals.some(item => !from.get(item.goalId) || from.get(item.goalId)!.archivedAt)) return null;
  const endedAt = new Date();
  const end = db.update(seasons).set({ endedAt })
    .where(and(eq(seasons.id, seasonId), eq(seasons.userId, userId), isNull(seasons.endedAt))).returning({ id: seasons.id });
  const ended = { season: { ...season, endedAt }, goals: history };
  if (!next) return (await end).length ? { ended, next: null } : null;
  const nextId = crypto.randomUUID();
  const carried = next.goals.map(item => ({ userId, seasonId: nextId, ...item, carriedFromId: from.get(item.goalId)!.id }));
  // Ending first frees the one-current-season index for the insert. A concurrent
  // end that already started a season makes the insert violate it, rolling back the whole batch.
  await db.batch([end, db.insert(seasons).values({ id: nextId, userId, startDate: next.startDate, lengthDays: next.lengthDays }),
    ...(carried.length ? [db.insert(seasonGoals).values(carried)] : [])]);
  return { ended, next: { season: { id: nextId, startDate: next.startDate, lengthDays: next.lengthDays, endedAt: null }, goals: await goalsOf(userId, nextId) } };
}
