// One-off: moves Todoist notes that the earlier importer appended to task
// descriptions (after a `---` line) into task_comments rows. Only touches tasks
// that have a Todoist import mapping. Dry run by default; pass --apply to write.
//   bun --env-file=.env scripts/backfill-imported-comments.ts [--apply]
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@todalo/db";
import { importMappings, taskComments, tasks } from "@todalo/db/schema";
import { splitImportedComments, TODOIST } from "../packages/server/src/todoist-import";

const apply = process.argv.includes("--apply");
const mapped = await db.select({ taskId: importMappings.localId }).from(importMappings)
  .where(and(eq(importMappings.provider, TODOIST), eq(importMappings.kind, "task")));
const ids = [...new Set(mapped.map((row) => row.taskId))];
const rows = ids.length
  ? await db.select({ id: tasks.id, userId: tasks.userId, description: tasks.description, createdAt: tasks.createdAt }).from(tasks).where(inArray(tasks.id, ids))
  : [];

let moved = 0, touched = 0;
for (const task of rows) {
  const split = splitImportedComments(task.description);
  if (!split) continue;
  touched++; moved += split.comments.length;
  console.log(`${task.id}: ${split.comments.length} comment(s)${split.description ? ", description kept" : ""}`);
  if (!apply) continue;
  // One transaction per task: comments in (spaced a millisecond apart to keep their order), description trimmed.
  await db.batch([
    db.insert(taskComments).values(split.comments.map((body, index) => ({ userId: task.userId, taskId: task.id, body, createdAt: new Date(task.createdAt.getTime() + index) }))),
    db.update(tasks).set({ description: split.description }).where(and(eq(tasks.id, task.id), eq(tasks.description, task.description!))),
  ]);
}
console.log(`${apply ? "Moved" : "Would move"} ${moved} comment(s) on ${touched} task(s).${apply ? "" : " Re-run with --apply to write."}`);
