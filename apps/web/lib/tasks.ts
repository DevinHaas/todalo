import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskLabels } from "@/db/schema";
import { getTasksForUser as queryTasks, getTodayTasksForUser } from "@todalo/server/today";

export { getTodayTasksForUser };

export async function getTasksForUser(userId: string, projectId?: string) {
  return queryTasks(userId, projectId);
}

export type Task = Awaited<ReturnType<typeof getTasksForUser>>[number];

export async function getOwnedTask(userId: string, id: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!task) return null;
  const associations = await db.select().from(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, id)));
  return { ...task, labelIds: associations.map(link => link.labelId) };
}

export async function getTodayTaskCount(userId: string) {
  return (await getTodayTasksForUser(userId)).openCount;
}
