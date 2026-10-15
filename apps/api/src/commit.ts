import { db } from "@todalo/db";
import { projects, tasks } from "@todalo/db/schema";
import type { RambleTodo } from "@todalo/ramble";
import { and, eq, inArray } from "drizzle-orm";
import { prepareTaskRows, RambleCommitError } from "./commit-rows";

/** Writes one staged batch. Retry-safe: replaying `operationId` inserts nothing twice. */
export async function commitRambleTodos(userId: string, todos: RambleTodo[], timeZone: string, operationId: string) {
  const rows = prepareTaskRows(todos, userId, timeZone, operationId);
  if (!rows.length) return 0;
  const projectIds = [...new Set(rows.flatMap((row) => row.projectId ? [row.projectId] : []))];
  if (projectIds.length) {
    const owned = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.userId, userId), inArray(projects.id, projectIds)));
    if (owned.length !== projectIds.length) throw new RambleCommitError("missing");
  }
  // A single INSERT is atomic even with Neon's HTTP driver, which does not
  // support interactive transactions. Parent IDs are allocated beforehand, and
  // rows a previous attempt already wrote (same derived IDs) are skipped.
  await db.insert(tasks).values(rows).onConflictDoNothing({ target: tasks.id });
  return rows.length;
}
