import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { labels, taskLabels } from "@/db/schema";

export async function assertOwnedLabels(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const owned = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.userId, userId), inArray(labels.id, unique)));
  if (owned.length !== unique.length) throw new Error("Label not found");
}
// Call only after task and label ownership have both been checked.
export async function replaceTaskLabels(userId: string, taskId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  await db.delete(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, taskId)));
  if (unique.length) await db.insert(taskLabels).values(unique.map(labelId => ({ userId, taskId, labelId })));
}
