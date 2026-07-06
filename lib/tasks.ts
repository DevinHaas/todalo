import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { isDueTodayOrOverdue } from "@/lib/task-dates";

export async function getTasksForUser(userId: string, projectId?: string) {
  return db
    .select()
    .from(tasks)
    .where(
      projectId
        ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId))
        : eq(tasks.userId, userId),
    )
    .orderBy(tasks.sortOrder);
}

export type Task = Awaited<ReturnType<typeof getTasksForUser>>[number];

export async function getTodayTaskCount(userId: string) {
  const userTasks = await getTasksForUser(userId);
  return userTasks.filter((t) => t.status !== "done" && isDueTodayOrOverdue(t)).length;
}
