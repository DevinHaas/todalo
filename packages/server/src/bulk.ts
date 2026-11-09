// Server-only bulk actions and manual reordering (ticket 15), shared by the
// legacy Server Actions and /api/v1. Every operation checks that the user owns
// every selected task before it writes anything: a selection with one missing
// or foreign ID changes nothing ("missing"). Bulk moves live in organization.ts.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@todalo/db";
import { taskLabels, tasks } from "@todalo/db/schema";
import { deleteTaskFromCalendar } from "./calendar";
import { assertOwnedLabels } from "./task-labels";
import { completeTask, syncToCalendar } from "./tasks";
import { manualOrder } from "./today";
import { criteriaAllowDone, tasksWithOpenCriteria } from "./milestones";
import { bulkIds, planReorder, type BulkCompletionDto, type ReorderInput } from "./bulk-input";
import type { Horizon } from "./task-dto";

/** One neon-http batch: the statements commit together or not at all. */
export async function atomically(writes: BatchItem<"pg">[]) {
  const [first, ...rest] = writes;
  if (first) await db.batch([first, ...rest]);
}

/** The user's rows for every requested ID, or null when any is missing or another user's. */
export async function ownedTasks(userId: string, ids: string[]) {
  const unique = bulkIds.parse([...new Set(ids)]);
  const rows = await db.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, unique)));
  return rows.length === unique.length ? rows : null;
}

/**
 * Completes each task with the due date the client saw and one tap ID, so a
 * retried request advances no recurring task twice. Per task (recurrence and
 * calendar effects), as legacy did; a task changed elsewhere is reported, not written.
 * "criteria": some task is a milestone with open done criteria and the user did
 * not confirm (goals ticket 06); nothing is written, so a selection never half-applies.
 */
export async function completeTasks(userId: string, items: { id: string; occurrence?: Date | null }[], operationId?: string, confirmCriteria = false): Promise<BulkCompletionDto | "missing" | "criteria"> {
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  if (!await ownedTasks(userId, unique.map(item => item.id))) return "missing";
  if (!confirmCriteria && (await tasksWithOpenCriteria(userId, unique.map(item => item.id))).length) return "criteria";
  const result: BulkCompletionDto = { completed: [], changed: [] };
  for (const item of unique) {
    const outcome = await completeTask(userId, item.id, { occurrence: item.occurrence, operationId, confirmCriteria });
    (outcome === "completed" ? result.completed : result.changed).push(item.id);
  }
  return result;
}

/** Calendar events first (legacy deleteTask order), then one statement for every row. */
export async function deleteTasks(userId: string, ids: string[]): Promise<boolean> {
  const rows = await ownedTasks(userId, ids);
  if (!rows) return false;
  for (const row of rows) if (row.googleCalendarEventId) await deleteTaskFromCalendar(userId, row.googleCalendarEventId);
  await db.delete(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, rows.map(row => row.id))));
  return true;
}

/** Legacy "clear-date": due date and end cleared in one statement, then each calendar push. */
export async function clearTaskDates(userId: string, ids: string[]): Promise<boolean> {
  const rows = await ownedTasks(userId, ids);
  if (!rows) return false;
  await db.update(tasks).set({ dueDate: null, dueDateEnd: null, updatedAt: new Date() }).where(and(eq(tasks.userId, userId), inArray(tasks.id, rows.map(row => row.id))));
  for (const row of rows) await syncToCalendar(userId, row.id);
  return true;
}

/**
 * Legacy bulkTaskMetadata: priority and deadline for every task, and labels
 * replacing each task's set. Goals ticket 31: or the horizon (Now, Next, Later). Throws MissingReferenceError for a deleted or
 * foreign label. All rows change in one batch.
 */
export async function updateTasksMetadata(userId: string, ids: string[], change: { priority?: number; deadline?: Date | null; labelIds?: string[]; horizon?: Horizon | null }): Promise<boolean> {
  const rows = await ownedTasks(userId, ids);
  if (!rows) return false;
  const { labelIds, ...fields } = change;
  if (labelIds !== undefined) await assertOwnedLabels(userId, labelIds);
  const targets = rows.map(row => row.id);
  const labels = [...new Set(labelIds ?? [])];
  // updatedAt moves so an editor opened on an older copy refuses to overwrite this change.
  const writes: BatchItem<"pg">[] = [db.update(tasks).set({ ...fields, updatedAt: new Date() }).where(and(eq(tasks.userId, userId), inArray(tasks.id, targets)))];
  if (labelIds !== undefined) {
    writes.push(db.delete(taskLabels).where(and(eq(taskLabels.userId, userId), inArray(taskLabels.taskId, targets))));
    if (labels.length) writes.push(db.insert(taskLabels).values(targets.flatMap(taskId => labels.map(labelId => ({ userId, taskId, labelId })))));
  }
  await atomically(writes);
  return true;
}

/** A project's tasks, or the Inbox's (`projectId: null`). */
export const inCollection = (projectId: string | null) => projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId);

/**
 * Places a task directly before or after another task of the same project (or
 * the Inbox), relative to the current server order. The whole collection is
 * renumbered in one batch, so concurrent reorders leave the last writer's
 * complete order rather than a mix, and a retry rewrites the same numbers.
 * Renumbering keeps `updatedAt` (open editors stay valid); a status change
 * (legacy status board, ticket 17) is an edit and moves it, in the same batch.
 * Without an anchor the task goes to the end of its collection, so a retried
 * drop is a no-op. "criteria": a drop into Done of a milestone with open done
 * criteria without `confirmCriteria`; nothing was written.
 */
export async function reorderTask(userId: string, id: string, move: ReorderInput): Promise<"reordered" | "missing" | "invalid" | "criteria"> {
  const anchorId = move.anchorId ?? null;
  const pair = await db.select({ id: tasks.id, projectId: tasks.projectId, status: tasks.status }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, anchorId ? [id, anchorId] : [id])));
  const task = pair.find(row => row.id === id);
  const anchor = pair.find(row => row.id === anchorId);
  if (!task || (anchorId && !anchor)) return "missing";
  if (anchor && (id === anchorId || task.projectId !== anchor.projectId)) return "invalid";
  // Goals ticket 06: a board drop into Done follows the completion rule.
  if (move.status === "done" && task.status !== "done" && !await criteriaAllowDone(userId, id, move.confirmCriteria)) return "criteria";
  const collection = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), inCollection(task.projectId))).orderBy(...manualOrder);
  const order = planReorder(collection.map(row => row.id), id, anchorId, move.position);
  if (!order) return "missing";
  const writes: BatchItem<"pg">[] = [];
  if (move.status && move.status !== task.status) writes.push(db.update(tasks).set({ status: move.status }).where(and(eq(tasks.id, id), eq(tasks.userId, userId))));
  // sql self-reference: without it drizzle's $onUpdate would move every row's updatedAt.
  // A task moved to another collection meanwhile keeps its own number.
  for (const [sortOrder, taskId] of order.entries()) writes.push(db.update(tasks).set({ sortOrder, updatedAt: sql`${tasks.updatedAt}` }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), inCollection(task.projectId))));
  await atomically(writes);
  return "reordered";
}
