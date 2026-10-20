import { db } from "@todalo/db";
import { labels, projects, taskLabels, tasks } from "@todalo/db/schema";
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
  const labelRows = todos.flatMap((todo, index) => [...new Set(todo.labelIds)].map((labelId) => ({ userId, taskId: rows[index].id, labelId })));
  const labelIds = [...new Set(labelRows.map((row) => row.labelId))];
  if (labelIds.length) {
    const owned = await db.select({ id: labels.id }).from(labels)
      .where(and(eq(labels.userId, userId), inArray(labels.id, labelIds)));
    if (owned.length !== labelIds.length) throw new RambleCommitError("missing", "Label unavailable");
  }
  // Neon's HTTP driver has no interactive transactions; a batch runs as one
  // non-interactive transaction. Parent IDs are allocated beforehand, and rows
  // a previous attempt already wrote (same derived IDs) are skipped.
  const insertTasks = db.insert(tasks).values(rows).onConflictDoNothing({ target: tasks.id });
  if (labelRows.length) await db.batch([insertTasks, db.insert(taskLabels).values(labelRows).onConflictDoNothing()]);
  else await insertTasks;
  return rows.length;
}
