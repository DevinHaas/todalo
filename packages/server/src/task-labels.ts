import { and, eq, inArray } from "drizzle-orm";
import { db } from "@todalo/db";
import { labels, taskLabels } from "@todalo/db/schema";
import { MissingReferenceError } from "./metadata-input";

export { MissingReferenceError };
/** Throws MissingReferenceError ("Label not found") for deleted or foreign labels. */
export async function assertOwnedLabels(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const owned = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.userId, userId), inArray(labels.id, unique)));
  if (owned.length !== unique.length) throw new MissingReferenceError();
}
// Call only after task and label ownership have both been checked.
export async function replaceTaskLabels(userId: string, taskId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const clear = db.delete(taskLabels).where(and(eq(taskLabels.userId, userId), eq(taskLabels.taskId, taskId)));
  // One neon-http batch: a single round trip, and the delete and insert commit together.
  if (unique.length) await db.batch([clear, db.insert(taskLabels).values(unique.map(labelId => ({ userId, taskId, labelId })))]);
  else await clear;
}
