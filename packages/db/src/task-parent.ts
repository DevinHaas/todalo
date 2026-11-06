import { eq } from "drizzle-orm";
import { db } from "./index";
import { tasks } from "./schema";
import { validateTaskParent, type TaskParentInput } from "./task-parent-validation";

export { validateTaskParent };
export type { TaskParentInput, TaskParentRecord } from "./task-parent-validation";

/** ponytail: loads the user's (id, parentId) pairs, one narrow query; a recursive CTE if task counts grow large. */
export const ownedTaskTree = (userId: string) =>
  db.select({ id: tasks.id, userId: tasks.userId, parentId: tasks.parentId }).from(tasks).where(eq(tasks.userId, userId));

export async function assertTaskParent(input: TaskParentInput): Promise<void> {
  if (input.parentId === null) return;
  validateTaskParent(input, await ownedTaskTree(input.userId));
}
