// Server-only query boundary. Transports authenticate before supplying userId.
// Do not import this package into client components except through type imports.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { tasks, taskLabels } from "@todalo/db/schema";

/** Manual order (ticket 15 reorders renumber it); ties broken so every read and the reorder planner agree. */
export const manualOrder = [asc(tasks.sortOrder), asc(tasks.createdAt), asc(tasks.id)] as const;

export async function getTasksForUser(userId: string, projectId?: string) {
  const [rows, associations] = await Promise.all([
    db.select().from(tasks).where(projectId
      ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId))
      : eq(tasks.userId, userId)).orderBy(...manualOrder),
    db.select().from(taskLabels).where(eq(taskLabels.userId, userId)),
  ]);
  return rows.map(task => ({
    ...task,
    labelIds: associations.filter(link => link.taskId === task.id).map(link => link.labelId),
  }));
}

/** Returns null for missing and other users' tasks alike, so callers cannot probe IDs. */
export async function getOwnedTask(userId: string, id: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!task) return null;
  const associations = await db.select().from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id)));
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

/** Call after all parallel page reads finish to preserve legacy count timing. */
export function countTodayTasks(tasks: readonly { status: string; dueDate: Date | string | null }[], now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tasks.filter(task => task.status !== "done" && task.dueDate !== null
    && new Date(task.dueDate) < tomorrow).length;
}
