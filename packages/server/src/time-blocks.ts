// Server-only time block operations (goals ticket 07). Every read and write is
// scoped to the owner, so a foreign block or goal ID behaves like a missing one.
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@todalo/db";
import { timeBlocks } from "@todalo/db/schema";
import { getOwnedGoal } from "./goals";
import type { CreateTimeBlockInput, UpdateTimeBlockInput } from "./time-block-dto";

const owned = (userId: string, id: string) => and(eq(timeBlocks.id, id), eq(timeBlocks.userId, userId));
const columns = { id: timeBlocks.id, goalId: timeBlocks.goalId, title: timeBlocks.title, startAt: timeBlocks.startAt, endAt: timeBlocks.endAt };
// ponytail: fixed look-back instead of a requested range; the schedule only shows this week and today.
const LOOK_BACK_MS = 8 * 7 * 24 * 60 * 60_000;

/** Blocks ending in the last eight weeks or later, by start. */
export async function getTimeBlocksForUser(userId: string, now = new Date()) {
  return db.select(columns).from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), gte(timeBlocks.endAt, new Date(now.getTime() - LOOK_BACK_MS))))
    .orderBy(asc(timeBlocks.startAt), asc(timeBlocks.id));
}

const goalAllowed = async (userId: string, goalId: string | null | undefined) => !goalId || Boolean(await getOwnedGoal(userId, goalId));

/** null when the goal is missing or foreign. */
export async function createTimeBlock(userId: string, input: CreateTimeBlockInput) {
  if (!await goalAllowed(userId, input.goalId)) return null;
  const [block] = await db.insert(timeBlocks).values({ userId, goalId: input.goalId ?? null, title: input.title ?? null, startAt: input.start, endAt: input.end }).returning(columns);
  return block!;
}

/** null when the block or the new goal is missing or foreign. */
export async function updateTimeBlock(userId: string, id: string, patch: UpdateTimeBlockInput) {
  if (!await goalAllowed(userId, patch.goalId)) return null;
  const [block] = await db.update(timeBlocks).set({
    ...(patch.start && { startAt: patch.start, endAt: patch.end }),
    ...(patch.goalId !== undefined && { goalId: patch.goalId }),
    ...(patch.title !== undefined && { title: patch.title }),
  }).where(owned(userId, id)).returning(columns);
  return block ?? null;
}

/** false when missing or foreign (a repeated delete is a 404). */
export async function deleteTimeBlock(userId: string, id: string) {
  const deleted = await db.delete(timeBlocks).where(owned(userId, id)).returning({ id: timeBlocks.id });
  return deleted.length > 0;
}
