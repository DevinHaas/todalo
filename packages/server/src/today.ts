// Server-only query boundary. Transports authenticate before supplying userId.
// Do not import this package into client components except through type imports.
import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { tasks, taskLabels } from "@todalo/db/schema";

export async function getTasksForUser(userId: string, projectId?: string) {
  const [rows, associations] = await Promise.all([
    db.select().from(tasks).where(projectId
      ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId))
      : eq(tasks.userId, userId)).orderBy(tasks.sortOrder),
    db.select().from(taskLabels).where(eq(taskLabels.userId, userId)),
  ]);
  return rows.map(task => ({
    ...task,
    labelIds: associations.filter(link => link.taskId === task.id).map(link => link.labelId),
  }));
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
