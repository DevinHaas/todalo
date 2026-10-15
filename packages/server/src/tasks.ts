// Server-only task commands shared by the legacy Server Actions and /api/v1.
// Callers authenticate first and pass the session's userId; nothing here reads
// request context or Next caches (callers revalidate their own views).
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { tasks } from "@todalo/db/schema";
import { assertTaskParent } from "@todalo/db/task-parent";
import { assertTaskOrganization } from "@todalo/db/task-organization";
import { nextOccurrenceOnCompletion } from "@todalo/ramble/recurrence";
import { deleteTaskFromCalendar, pushTaskToCalendar } from "./calendar";
import { assertOwnedLabels, replaceTaskLabels } from "./task-labels";
import { createTaskInput, type CreateTaskInput } from "./task-input";

/** A client-chosen task ID that already belongs to a different user. */
export class TaskIdConflictError extends Error {
  constructor() { super("Task ID is already in use"); this.name = "TaskIdConflictError"; }
}

export async function syncToCalendar(userId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return;
  const result = await pushTaskToCalendar(userId, task);
  if (result && result.googleCalendarEventId !== task.googleCalendarEventId) {
    await db
      .update(tasks)
      .set({ googleCalendarEventId: result.googleCalendarEventId })
      .where(eq(tasks.id, taskId));
  }
}

const ownedId = async (userId: string, id: string) =>
  (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1)).length > 0;

/**
 * Creates a task. With a client-supplied `id`, a replay of an already-applied
 * create returns `{ created: false }` and repeats no side effects (sort shifts,
 * labels, calendar event), so an ambiguous response can be retried safely.
 */
export async function createTask(userId: string, input: CreateTaskInput): Promise<{ id: string; created: boolean }> {
  const { placement, labelIds, id, ...data } = createTaskInput.parse(input);
  if (id && await ownedId(userId, id)) return { id, created: false };
  if (labelIds !== undefined) await assertOwnedLabels(userId, labelIds);
  await assertTaskOrganization({ userId, projectId: data.projectId ?? null, sectionId: data.sectionId ?? null });
  if (data.parentId) {
    await assertTaskParent({ userId, parentId: data.parentId });
    const [parent] = await db.select().from(tasks).where(and(eq(tasks.id, data.parentId), eq(tasks.userId, userId))).limit(1);
    if (data.projectId !== undefined && data.projectId !== parent.projectId || data.sectionId !== undefined && data.sectionId !== parent.sectionId) throw new Error("A child task must use its parent's project and section");
    data.projectId = parent.projectId; data.sectionId = parent.sectionId;
  }
  let sortOrder = 0;
  if (placement) {
    const collection = await db.select({ id: tasks.id, sortOrder: tasks.sortOrder, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.userId, userId), data.projectId ? eq(tasks.projectId, data.projectId) : sql`${tasks.projectId} is null`)).orderBy(asc(tasks.sortOrder));
    const anchor = collection.find(task => task.id === placement.anchorId);
    if ((placement.edge === "above" || placement.edge === "below") && !anchor) throw new Error("Task not found");
    sortOrder = placement.edge === "top" ? (collection[0]?.sortOrder ?? 0) - 1 : placement.edge === "bottom" ? (collection.at(-1)?.sortOrder ?? -1) + 1 : anchor!.sortOrder + (placement.edge === "below" ? 1 : 0);
    if (anchor) await db.update(tasks).set({ sortOrder: sql`${tasks.sortOrder} + 1` }).where(and(eq(tasks.userId, userId), data.projectId ? eq(tasks.projectId, data.projectId) : sql`${tasks.projectId} is null`, sql`${tasks.sortOrder} >= ${sortOrder}`));
  }
  // The primary key is the operation-ID store: a concurrent replay loses this
  // insert and is answered from the row the first request wrote.
  const [task] = await db.insert(tasks).values({ ...(id && { id }), userId, ...data, sortOrder }).onConflictDoNothing().returning();
  if (!task) {
    if (id && await ownedId(userId, id)) return { id, created: false };
    throw new TaskIdConflictError();
  }
  if (labelIds !== undefined) await replaceTaskLabels(userId, task.id, labelIds);
  if (task.dueDate) await syncToCalendar(userId, task.id);
  return { id: task.id, created: true };
}

/** Returns false for missing and other users' tasks alike. */
export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!task) return false;
  if (task.googleCalendarEventId) {
    await deleteTaskFromCalendar(userId, task.googleCalendarEventId);
  }
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  return true;
}

/**
 * Completes a task, advancing a recurring one. Returns false for missing and
 * other users' tasks. Replays are no-ops: a done task stays as it is, and when
 * `occurrence` (the due date the caller saw) is given, a recurring task that
 * has already moved past it is not advanced a second time.
 */
export async function completeTask(userId: string, id: string, options: { occurrence?: Date | null } = {}): Promise<boolean> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!task) return false;
  if (task.status === "done") return true;
  if (options.occurrence !== undefined && (task.dueDate?.getTime() ?? null) !== (options.occurrence?.getTime() ?? null)) return true;

  if (task.recurrence) {
    const completedAt = new Date();
    const next = nextOccurrenceOnCompletion(task.dueDate, completedAt, task.recurrence);
    if (next) {
      await db.update(tasks).set({ dueDate: next, completedAt: null }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      await syncToCalendar(userId, id);
    } else {
      // `until` has passed — complete this occurrence without rescheduling.
      await db.update(tasks).set({ completedAt, status: "done" }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    }
  } else {
    await db.update(tasks).set({ completedAt: new Date(), status: "done" }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
  return true;
}
