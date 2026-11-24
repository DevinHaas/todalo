// Server-only query boundary. Transports authenticate before supplying userId.
// Do not import this package into client components except through type imports.
import { and, asc, count, eq, getTableColumns, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@todalo/db";
import { taskComments, tasks, taskLabels } from "@todalo/db/schema";

// List indicators: comments counted in the task select itself, so each list stays one task query.
const withCommentCount = {
  ...getTableColumns(tasks),
  // Qualified by hand: drizzle renders bare column names inside select fields, and an
  // unqualified "id" here would bind to task_comments.id instead of the outer task.
  commentCount: sql<number>`(select count(*) from "task_comments" where "task_comments"."task_id" = "tasks"."id")`.mapWith(Number),
};

/** Manual order (ticket 15 reorders renumber it); ties broken so every read and the reorder planner agree. */
export const manualOrder = [asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id)] as const;

export async function getTasksForUser(userId: string, projectId?: string) {
  const [rows, associations] = await Promise.all([
    db.select(withCommentCount).from(tasks).where(projectId
      ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId))
      : eq(tasks.userId, userId)).orderBy(...manualOrder),
    db.select().from(taskLabels).where(eq(taskLabels.userId, userId)),
  ]);
  const labels = labelsByTask(associations);
  return rows.map(task => ({ ...task, labelIds: labels.get(task.id) ?? [] }));
}

/** The user's tasks among `ids` (the live sync delta); missing and foreign IDs are left out. */
export async function getTasksByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const [rows, associations] = await Promise.all([
    db.select(withCommentCount).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, ids))),
    db.select().from(taskLabels).where(and(eq(taskLabels.userId, userId), inArray(taskLabels.taskId, ids))),
  ]);
  const labels = labelsByTask(associations);
  return rows.map(task => ({ ...task, labelIds: labels.get(task.id) ?? [] }));
}

/** Label IDs grouped by task in one pass (a filter per task was tasks × links). */
function labelsByTask(links: readonly { taskId: string; labelId: string }[]) {
  const labels = new Map<string, string[]>();
  for (const link of links) { const list = labels.get(link.taskId); if (list) list.push(link.labelId); else labels.set(link.taskId, [link.labelId]); }
  return labels;
}

/** Returns null for missing and other users' tasks alike, so callers cannot probe IDs. */
export async function getOwnedTask(userId: string, id: string) {
  // One round trip: the label query is scoped to the user, so it is safe to run alongside.
  const [[task], associations] = await Promise.all([
    db.select(withCommentCount).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1),
    db.select().from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id))),
  ]);
  if (!task) return null;
  return { ...task, labelIds: associations.map(link => link.labelId) };
}

/** Retain the full collection for Today list, board, calendar and completion toggle.
 * Date counting intentionally uses the server's local day, as the legacy query
 * does; it is not UTC truncation or a new account-timezone interpretation.
 */
export async function getTodayTasksForUser(userId: string, now?: Date) {
  const tasks = await getTasksForUser(userId);
  return { tasks, openCount: countTodayTasks(tasks, now) };
}

/** A task's labels and comment count: what getOwnedTask adds to a row a write already returned. */
export async function taskExtras(userId: string, id: string) {
  const [labels, [comments]] = await Promise.all([
    db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id))),
    db.select({ n: count() }).from(taskComments).where(eq(taskComments.taskId, id)),
  ]);
  return { labelIds: labels.map(link => link.labelId), commentCount: comments?.n ?? 0 };
}

/** How long a completed task stays in the API's Today collection (`recentCollection`). */
export const RECENTLY_COMPLETED_DAYS = 30;

/**
 * The collection the app keeps in memory (and on disk): every open task, tasks completed in the
 * last `days`, and older completed tasks an open tree still shows: ancestors of what is kept (the
 * sheet's breadcrumb) and completed children of open tasks (sub-task progress). Without the
 * window it grows with every task ever completed. Other screens read their own endpoints.
 */
export function recentCollection<T extends { id: string; parentId: string | null; status: string; completedAt: Date | string | null }>(all: readonly T[], now = new Date(), days = RECENTLY_COMPLETED_DAYS): T[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const byId = new Map(all.map(task => [task.id, task]));
  const kept = new Set(all.filter(task => task.status !== "done" || task.completedAt === null || new Date(task.completedAt).getTime() >= cutoff).map(task => task.id));
  for (const task of all) {
    // A completed child of an open parent counts toward its progress.
    if (!kept.has(task.id) && task.parentId && byId.get(task.parentId)?.status !== "done") kept.add(task.id);
  }
  for (const id of [...kept]) {
    // Every ancestor of a kept task, for its breadcrumb and tree.
    for (let parent = byId.get(id)?.parentId, guard = 0; parent && guard < 50; parent = byId.get(parent)?.parentId, guard++) kept.add(parent);
  }
  return all.filter(task => kept.has(task.id));
}

/** Only what the task DTO shows (task-dto.ts toTaskDto): a list read sends ~40% fewer bytes. */
const listColumns = {
  id: tasks.id, title: tasks.title, description: tasks.description, status: tasks.status, priority: tasks.priority,
  projectId: tasks.projectId, sectionId: tasks.sectionId, parentId: tasks.parentId, dueDate: tasks.dueDate, dueDateEnd: tasks.dueDateEnd,
  deadline: tasks.deadline, completedAt: tasks.completedAt, recurrence: tasks.recurrence, updatedAt: tasks.updatedAt,
  horizon: tasks.horizon, createdAt: tasks.createdAt, reviewedAt: tasks.reviewedAt, commentCount: withCommentCount.commentCount,
};

/**
 * The API's Today collection (recentCollection's rule) in one round trip, with only the DTO's
 * columns. Neon's HTTP answers are uncompressed and a connection idle for a few seconds starts
 * slow again, so every 14 KB of result past the first costs another round trip to the
 * database; long-completed tasks are left out in SQL first (a superset: anything with children
 * or under an open parent stays for recentCollection to decide). The open count is the same as
 * the full list's: every open task is in it.
 */
export async function getTodayCollection(userId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENTLY_COMPLETED_DAYS * 24 * 60 * 60 * 1000);
  const collection = recentCollection(await taskList(userId, PARTS, or(
    ne(tasks.status, "done"), isNull(tasks.completedAt), gte(tasks.completedAt, cutoff),
    sql`exists (select 1 from "tasks" as parent where parent.id = ${tasks.parentId} and parent.status <> 'done')`,
    sql`exists (select 1 from "tasks" as child where child.parent_id = ${tasks.id})`,
  )), now);
  return { tasks: collection, openCount: countTodayTasks(collection, now) };
}

/** A project page's tasks with only the DTO's columns (getTasksForUser's rows and order otherwise). */
export const getProjectTaskList = (userId: string, projectId: string) => taskList(userId, 1, eq(tasks.projectId, projectId));

/**
 * Today's read in this many parallel queries (by a hash of the ID), each on its own connection:
 * after a few idle seconds each one restarts TCP slow start, and several small answers arrive in
 * fewer round trips than one large one (measured: ~600 → ~400 ms for 400 tasks). ponytail: a
 * workaround for the API being far from the database: set TODAY_READ_PARTS=1 once they share a region.
 */
const PARTS = readParts(process.env.TODAY_READ_PARTS);
/** TODAY_READ_PARTS: 1, 2, 4 or 8 (a power of two: parts are picked by the hash's low bits); default 4. */
export function readParts(value: string | undefined) {
  const parts = Number(value ?? 4);
  return [1, 2, 4, 8].includes(parts) ? parts : 4;
}
// manualOrder in JS: created_at as Postgres prints it (microseconds; a Date keeps milliseconds,
// and same-millisecond rows would tie), and IDs by code point (the database collation is C).
const text = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const byManualOrder = (a: { sortOrder: number | null; createdText: string; id: string }, b: typeof a) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || text(a.createdText, b.createdText) || text(a.id, b.id);

/** The user's tasks matching `where`, in manual order, with their label IDs: DTO columns only. */
async function taskList(userId: string, parts: number, where?: SQL) {
  const read = (part?: number) => db.select({ ...listColumns, sortOrder: tasks.sortOrder, createdText: sql<string>`${tasks.createdAt}::text` }).from(tasks)
    .where(and(eq(tasks.userId, userId), where, part === undefined ? undefined : sql`(hashtext(${tasks.id}) & ${parts - 1}) = ${part}`));
  const [chunks, associations] = await Promise.all([
    parts > 1 ? Promise.all(Array.from({ length: parts }, (_, part) => read(part))) : read().orderBy(...manualOrder).then(rows => [rows]),
    db.select({ taskId: taskLabels.taskId, labelId: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.userId, userId)),
  ]);
  const rows = parts > 1 ? chunks.flat().sort(byManualOrder) : chunks[0];
  const labels = labelsByTask(associations);
  return rows.map(({ sortOrder: _order, createdText: _created, ...task }) => ({ ...task, labelIds: labels.get(task.id) ?? [] }));
}

/** Call after all parallel page reads finish to preserve legacy count timing. */
export function countTodayTasks(tasks: readonly { status: string; dueDate: Date | string | null }[], now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tasks.filter(task => task.status !== "done" && task.dueDate !== null
    && new Date(task.dueDate) < tomorrow).length;
}
