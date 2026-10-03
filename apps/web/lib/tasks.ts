import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskLabels } from "@/db/schema";
import { isDueTodayOrOverdue } from "@/lib/task-dates";

export async function getTasksForUser(userId: string, projectId?: string) {
  const [rows, associations] = await Promise.all([db
    .select()
    .from(tasks)
    .where(
      projectId
        ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId))
        : eq(tasks.userId, userId),
    )
    .orderBy(tasks.sortOrder), db.select().from(taskLabels).where(eq(taskLabels.userId, userId))]);
  return rows.map(task => ({ ...task, labelIds: associations.filter(link => link.taskId === task.id).map(link => link.labelId) }));
}

export type Task = Awaited<ReturnType<typeof getTasksForUser>>[number];

export async function getOwnedTask(userId: string, id: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!task) return null;
  const associations = await db.select().from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id)));
  return { ...task, labelIds: associations.map(link => link.labelId) };
}

export async function getTodayTaskCount(userId: string) {
  const userTasks = await getTasksForUser(userId);
  return userTasks.filter((t) => t.status !== "done" && isDueTodayOrOverdue(t)).length;
}
