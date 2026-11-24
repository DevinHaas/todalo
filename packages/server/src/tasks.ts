// Server-only task commands shared by the legacy Server Actions and /api/v1.
// Callers authenticate first and pass the session's userId; nothing here reads
// request context or Next caches (callers revalidate their own views).
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { taskLabels, tasks } from "@todalo/db/schema";
import { assertTaskParent, ownedTaskTree } from "@todalo/db/task-parent";
import { subtreeIds, taskTree } from "@todalo/db/task-parent-validation";
import { assertTaskOrganization } from "@todalo/db/task-organization";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import { deleteTaskFromCalendar, pushTaskToCalendar } from "./calendar";
import { assertOwnedLabels, replaceTaskLabels } from "./task-labels";
import { createTaskInput, updateTaskInput, type CreateTaskInput, type UpdateTaskInput } from "./task-input";
import { editConflicts, planCompletion, type CompletionRequest } from "./task-rules";
import { criteriaAllowDone, tasksWithOpenCriteria, tickAllCriteria } from "./milestones";

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

// Calendar pushes run after the write has answered: a Google round trip is not the user's wait.
// They run one at a time per task, so a create and a quick edit or delete never race into a
// second event or an orphan. ponytail: in-process queue; a restart mid-push drops that push.
const pushes = new Map<string, Promise<void>>();
function calendarLater(taskId: string, work: () => Promise<void>) {
  const run = (pushes.get(taskId) ?? Promise.resolve()).then(work)
    .catch((error: unknown) => console.error("Google Calendar sync failed for task", taskId, error));
  pushes.set(taskId, run);
  void run.finally(() => { if (pushes.get(taskId) === run) pushes.delete(taskId); });
}
const syncToCalendarLater = (userId: string, taskId: string) => calendarLater(taskId, () => syncToCalendar(userId, taskId));
/** Resolves once every queued calendar push has run (tests; graceful shutdown). */
export async function calendarSettled() { while (pushes.size) await Promise.all(pushes.values()); }

const ownedId = async (userId: string, id: string) =>
  (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1)).length > 0;

/**
 * Creates a task. With a client-supplied `id`, a replay of an already-applied
 * create returns `{ created: false }` and repeats no side effects (sort shifts,
 * labels, calendar event), so an ambiguous response can be retried safely.
 */
/** `task`: the inserted row when `created` (callers answer with it instead of reading it back). */
export async function createTask(userId: string, input: CreateTaskInput): Promise<{ id: string; created: boolean; task?: typeof tasks.$inferSelect }> {
  const { placement, labelIds, id, ...data } = createTaskInput.parse(input);
  // A replay is caught up front only when it would repeat a write before the insert (placement's
  // sort shift); otherwise the insert's conflict below recognises it, one round trip fewer.
  if (id && placement && await ownedId(userId, id)) return { id, created: false };
  await Promise.all([
    labelIds !== undefined && assertOwnedLabels(userId, labelIds),
    assertTaskOrganization({ userId, projectId: data.projectId ?? null, sectionId: data.sectionId ?? null }),
  ]);
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
    if ((placement.edge === "above" || placement.edge === "below") && !anchor) throw new TaskOrganizationError("Task not found", "missing");
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
  if (task.dueDate) syncToCalendarLater(userId, task.id);
  return { id: task.id, created: true, task };
}

/** Returns false for missing and other users' tasks alike. */
export async function deleteTask(userId: string, id: string): Promise<boolean> {
  await pushes.get(id); // a push still queued for it would otherwise leave an orphan event
  // One statement, and its calendar event goes after the answer (deleteTaskFromCalendar logs a
  // failure rather than keeping the task, so the order never mattered to the outcome).
  const [task] = await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ googleCalendarEventId: tasks.googleCalendarEventId });
  if (!task) return false;
  const eventId = task.googleCalendarEventId;
  if (eventId) calendarLater(id, () => deleteTaskFromCalendar(userId, eventId));
  return true;
}

/**
 * Completes a task, advancing a recurring one (rules in ./task-rules). Replays
 * are no-ops: a done task stays as it is, and a retried operation ID is
 * recognised after the task moved on. "changed" means the caller's
 * `occurrence` is no longer the task's due date (another device edited or
 * completed it), so nothing was written. "criteria" (goals ticket 06): the
 * task is a milestone with open done criteria and the request did not carry
 * `confirmCriteria`; nothing was written. A confirmed one ticks them all.
 */
/** `written`: called with the row this call wrote (not on a replay that wrote nothing). */
export async function completeTask(userId: string, id: string, request: CompletionRequest = {}, written?: (task: typeof tasks.$inferSelect) => void): Promise<"completed" | "missing" | "changed" | "criteria"> {
  const owned = and(eq(tasks.id, id), eq(tasks.userId, userId));
  // One retry: a lost compare-and-set re-reads and decides again (for example,
  // the concurrent writer was this same operation's earlier attempt).
  for (let attempt = 0; attempt < 2; attempt++) {
    // The milestone check is a read: it shares the task read's round trip (criteriaAllowDone's rule).
    const [[task], open] = await Promise.all([db.select().from(tasks).where(owned), tasksWithOpenCriteria(userId, [id])]);
    if (!task) return "missing";
    const plan = planCompletion(task, request);
    if (plan.kind !== "write") return plan.kind === "changed" ? "changed" : "completed";
    if (open.length) {
      if (!request.confirmCriteria) return "criteria";
      await tickAllCriteria(userId, id);
    }
    // Compare-and-set against the state the plan came from: neon-http has no
    // interactive transactions, and a concurrent completion or date edit must
    // not be overwritten or advanced twice.
    const [row] = await db.update(tasks).set({ ...plan.patch, updatedAt: new Date() })
      .where(and(owned, ne(tasks.status, "done"), same(tasks.dueDate, task.dueDate), same(tasks.lastCompletionId, task.lastCompletionId)))
      .returning();
    if (!row) continue;
    written?.(row);
    if (plan.patch.dueDate) syncToCalendarLater(userId, id);
    return "completed";
  }
  return "changed";
}

const same = <T,>(column: Parameters<typeof eq>[0], value: T | null) => value === null ? isNull(column) : eq(column, value);

/**
 * The legacy task edit (moved from the Server Action): fields, labels,
 * organization and parent with their invariants, then the calendar push when
 * `dueDate` is part of the edit. With `seenUpdatedAt` (the copy the editor
 * started from) an edit of a task changed elsewhere is refused as "changed"
 * unless it is a replay of itself (see `editConflicts`).
 */
/** `written`: called with the row this call wrote (its labels are the input's when it set them). */
export async function updateTask(userId: string, input: UpdateTaskInput, options: { seenUpdatedAt?: Date; confirmCriteria?: boolean } = {}, written?: (task: typeof tasks.$inferSelect) => void): Promise<"updated" | "missing" | "changed" | "criteria"> {
  const { id, labelIds, ...data } = updateTaskInput.parse(input);
  // The task, its current labels and the new labels' ownership in one round trip; their
  // outcomes still apply in order (missing, then changed, then a label error).
  const [[owned], links, labelError] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1),
    labelIds !== undefined && options.seenUpdatedAt
      ? db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id)))
      : null,
    labelIds !== undefined ? assertOwnedLabels(userId, labelIds).then(() => null, (error: unknown) => ({ error })) : null,
  ]);
  if (!owned) return "missing";
  // ponytail: the check and the write are separate statements (no neon-http
  // transactions); a write landing in between is last-write-wins, as before.
  // Labels take part in the stale check as a sorted set, so a replay is still
  // recognised and another device's label change is not silently overwritten.
  const labelSet = (ids: string[]) => [...new Set(ids)].sort();
  const current = links ? labelSet(links.map(link => link.labelId)) : undefined;
  if (editConflicts(current ? { ...owned, labelIds: current } : owned, current ? { ...data, labelIds: labelSet(labelIds!) } : data, options.seenUpdatedAt)) return "changed";
  if (labelError) throw labelError.error;
  // Goals ticket 06: a status edit to done follows the completion rule.
  if (data.status === "done" && owned.status !== "done" && !await criteriaAllowDone(userId, id, options.confirmCriteria)) return "criteria";
  if (data.projectId !== undefined || data.sectionId !== undefined) {
    await assertTaskOrganization({ userId, projectId: data.projectId === undefined ? owned.projectId : data.projectId, sectionId: data.sectionId === undefined ? (data.projectId !== undefined && data.projectId !== owned.projectId ? null : owned.sectionId) : data.sectionId });
  }
  if (data.parentId) {
    await assertTaskParent({ userId, taskId: id, parentId: data.parentId });
    const [parent] = await db.select().from(tasks).where(and(eq(tasks.id, data.parentId), eq(tasks.userId, userId))).limit(1);
    data.projectId = parent.projectId; data.sectionId = parent.sectionId;
  }
  const projectId = data.projectId === undefined ? owned.projectId : data.projectId;
  const sectionId = data.sectionId === undefined ? (data.projectId !== undefined && data.projectId !== owned.projectId ? null : owned.sectionId) : data.sectionId;
  await assertTaskOrganization({ userId, projectId, sectionId });
  if (data.projectId !== undefined) data.sectionId = sectionId;
  const organizationChanged = projectId !== owned.projectId || sectionId !== owned.sectionId;
  if (organizationChanged && owned.parentId && data.parentId === undefined) data.parentId = null;
  if (data.parentId !== undefined) {
    const [existing] = await db.select({ id: tasks.id }).from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
    if (!existing) return "missing";
    await assertTaskParent({ userId, taskId: id, parentId: data.parentId });
  }
  // The row and its labels are independent writes (never one transaction on neon-http): together.
  const [[row]] = await Promise.all([
    db.update(tasks).set({ ...data, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning(),
    labelIds !== undefined ? replaceTaskLabels(userId, id, labelIds) : null,
  ]);
  // The whole subtree follows its root into the new project and section.
  if (organizationChanged) {
    const descendants = subtreeIds(id, taskTree(await ownedTaskTree(userId))).slice(1);
    if (descendants.length) await db.update(tasks).set({ projectId, sectionId }).where(and(inArray(tasks.id, descendants), eq(tasks.userId, userId)));
  }
  // What the event shows changed (two-way sync keeps title and times in step).
  if (["dueDate", "dueDateEnd", "title", "description"].some(field => field in data) && (owned.dueDate || owned.googleCalendarEventId || data.dueDate)) syncToCalendarLater(userId, id);
  if (row) written?.(row);
  return "updated";
}
