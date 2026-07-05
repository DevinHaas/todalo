import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";

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
