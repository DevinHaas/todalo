export type TaskParentInput = {
  userId: string;
  taskId?: string;
  parentId: string | null;
};

export type TaskParentRecord = {
  id: string;
  userId: string;
  parentId: string | null;
};

/** Validate both persisted and staged parents using the same single-level rules. */
export function validateTaskParent(
  input: TaskParentInput,
  parent: TaskParentRecord | undefined,
  hasChildren = false,
): void {
  if (input.parentId === null) return;
  if (input.taskId === input.parentId) throw new Error("A task cannot be its own parent");
  if (!parent || parent.id !== input.parentId || parent.userId !== input.userId) {
    throw new Error("Parent task not found");
  }
  if (parent.parentId !== null) throw new Error("Sub-tasks cannot have sub-tasks");
  if (hasChildren) throw new Error("A task with sub-tasks cannot become a sub-task");
}
