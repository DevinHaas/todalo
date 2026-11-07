// Server-only time block operations (goals tickets 07, 08, 09, 10). Every read and write is
// scoped to the owner, so a foreign block, goal or task ID behaves like a missing one.
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { tasks, timeBlockTasks, timeBlocks } from "@todalo/db/schema";
import { pushBlockToCalendar } from "./calendar";
import { getOwnedGoal } from "./goals";
import type { BlockOutcome, CreateTimeBlockInput, TimeBlockRecord, UpdateTimeBlockInput } from "./time-block-dto";

const owned = (userId: string, id: string) => and(eq(timeBlocks.id, id), eq(timeBlocks.userId, userId));
const columns = { id: timeBlocks.id, goalId: timeBlocks.goalId, title: timeBlocks.title, startAt: timeBlocks.startAt, endAt: timeBlocks.endAt, outcome: timeBlocks.outcome, rescheduleCount: timeBlocks.rescheduleCount, googleCalendarEventId: timeBlocks.googleCalendarEventId };
type BlockRow = Omit<TimeBlockRecord, "taskIds">;
// ponytail: fixed look-back instead of a requested range; the schedule only shows this week and today.
const LOOK_BACK_MS = 8 * 7 * 24 * 60 * 60_000;

/** Attaches each block's task IDs, in the order they were put in. */
async function withTasks(userId: string, blocks: BlockRow[]): Promise<TimeBlockRecord[]> {
  const links = blocks.length ? await db.select({ blockId: timeBlockTasks.blockId, taskId: timeBlockTasks.taskId }).from(timeBlockTasks)
    .where(and(eq(timeBlockTasks.userId, userId), inArray(timeBlockTasks.blockId, blocks.map(block => block.id))))
    .orderBy(asc(timeBlockTasks.createdAt), asc(timeBlockTasks.id)) : [];
  return blocks.map(block => ({ ...block, taskIds: links.filter(link => link.blockId === block.id).map(link => link.taskId) }));
}
const one = async (userId: string, block: BlockRow | undefined) => block ? (await withTasks(userId, [block]))[0]! : null;

/** Blocks ending in the last eight weeks or later, by start. */
export async function getTimeBlocksForUser(userId: string, now = new Date()) {
  return withTasks(userId, await db.select(columns).from(timeBlocks)
    .where(and(eq(timeBlocks.userId, userId), gte(timeBlocks.endAt, new Date(now.getTime() - LOOK_BACK_MS))))
    .orderBy(asc(timeBlocks.startAt), asc(timeBlocks.id)));
}

const goalAllowed = async (userId: string, goalId: string | null | undefined) => !goalId || Boolean(await getOwnedGoal(userId, goalId));

/** null when the goal is missing or foreign. */
export async function createTimeBlock(userId: string, input: CreateTimeBlockInput): Promise<TimeBlockRecord | null> {
  if (!await goalAllowed(userId, input.goalId)) return null;
  const [block] = await db.insert(timeBlocks).values({ userId, goalId: input.goalId ?? null, title: input.title ?? null, startAt: input.start, endAt: input.end }).returning(columns);
  return { ...block!, taskIds: [] };
}

/** Ticket 09: records the block's outcome; "rescheduled" counts once more each time. null when missing or foreign. */
export async function setTimeBlockOutcome(userId: string, id: string, outcome: BlockOutcome) {
  const [block] = await db.update(timeBlocks).set({
    outcome, ...(outcome === "rescheduled" && { rescheduleCount: sql`${timeBlocks.rescheduleCount} + 1` }),
  }).where(owned(userId, id)).returning(columns);
  return one(userId, block);
}

/** null when the block or the new goal is missing or foreign. */
export async function updateTimeBlock(userId: string, id: string, patch: UpdateTimeBlockInput) {
  if (!await goalAllowed(userId, patch.goalId)) return null;
  const [block] = await db.update(timeBlocks).set({
    ...(patch.start && { startAt: patch.start, endAt: patch.end }),
    ...(patch.goalId !== undefined && { goalId: patch.goalId }),
    ...(patch.title !== undefined && { title: patch.title }),
  }).where(owned(userId, id)).returning(columns);
  return one(userId, block);
}

/** The deleted block's calendar event; null when missing or foreign (a repeated delete is a 404). */
export async function deleteTimeBlock(userId: string, id: string) {
  const [deleted] = await db.delete(timeBlocks).where(owned(userId, id)).returning({ googleCalendarEventId: timeBlocks.googleCalendarEventId });
  return deleted ?? null;
}

/**
 * Ticket 10: pushes the block to Google Calendar as an event named after its
 * title or goal; the event's ID, or null when Google is unlinked or failed.
 */
export async function pushTimeBlock(userId: string, block: TimeBlockRecord) {
  const goal = block.goalId ? await getOwnedGoal(userId, block.goalId) : null;
  const result = await pushBlockToCalendar(userId, {
    id: block.id, summary: block.title ?? goal?.title ?? "Time block", start: block.startAt, end: block.endAt, googleCalendarEventId: block.googleCalendarEventId ?? null,
  });
  return result?.googleCalendarEventId ?? null;
}

export async function setTimeBlockEventId(userId: string, id: string, googleCalendarEventId: string) {
  await db.update(timeBlocks).set({ googleCalendarEventId }).where(owned(userId, id));
}

/**
 * Puts a task into a block (`linked`) or takes it out; both idempotent. The
 * block afterwards, or null when the block or task is missing or foreign.
 */
export async function setTimeBlockTask(userId: string, blockId: string, taskId: string, linked: boolean) {
  const [block] = await db.select(columns).from(timeBlocks).where(owned(userId, blockId));
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  if (!block || !task) return null;
  if (linked) await db.insert(timeBlockTasks).values({ userId, blockId, taskId }).onConflictDoNothing();
  else await db.delete(timeBlockTasks).where(and(eq(timeBlockTasks.userId, userId), eq(timeBlockTasks.blockId, blockId), eq(timeBlockTasks.taskId, taskId)));
  return one(userId, block);
}
