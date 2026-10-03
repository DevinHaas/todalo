import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { tasks } from "./schema";
import { validateTaskParent, type TaskParentInput } from "./task-parent-validation";

export { validateTaskParent };
export type { TaskParentInput, TaskParentRecord } from "./task-parent-validation";

export async function assertTaskParent(input: TaskParentInput): Promise<void> {
  if (input.parentId === null) return;
  const [parent] = await db.select({ id: tasks.id, userId: tasks.userId, parentId: tasks.parentId })
    .from(tasks)
    .where(and(eq(tasks.id, input.parentId), eq(tasks.userId, input.userId)))
    .limit(1);
  const children = input.taskId
    ? await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.parentId, input.taskId)).limit(1)
    : [];
  validateTaskParent(input, parent, children.length > 0);
}
