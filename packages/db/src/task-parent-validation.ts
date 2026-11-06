import { TaskOrganizationError } from "./task-organization-validation";

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
  if (input.taskId === input.parentId) throw new TaskOrganizationError("A task cannot be its own parent", "invalid");
  if (!parent || parent.id !== input.parentId || parent.userId !== input.userId) {
    throw new TaskOrganizationError("Parent task not found", "missing");
  }
  if (parent.parentId !== null) throw new TaskOrganizationError("Sub-tasks cannot have sub-tasks", "invalid");
  if (hasChildren) throw new TaskOrganizationError("A task with sub-tasks cannot become a sub-task", "invalid");
}
