// Production binding of the task routes to the shared server operations (the
// same functions the legacy Server Actions wrap), including calendar effects.
import { getOwnedTask } from "@todalo/server/today";
import { completeTask, createTask, deleteTask, TaskIdConflictError, updateTask } from "@todalo/server/tasks";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import type { TaskWrites } from "./task-routes";

export const taskOperations: Omit<TaskWrites, "allowedOrigins"> = {
  async create(userId, input) {
    try {
      // createTaskInput coerces the ISO strings (dueDateEnd, recurrence.until) to dates.
      const { id, created } = await createTask(userId, { ...input, dueDate: input.dueDate ?? undefined });
      const task = await getOwnedTask(userId, id);
      if (!task) throw new Error("Created task could not be read");
      return { task, created };
    } catch (error) {
      if (error instanceof TaskIdConflictError) return null;
      throw error;
    }
  },
  async complete(userId, id, request) {
    const result = await completeTask(userId, id, request);
    return result === "completed" ? getOwnedTask(userId, id) : result === "changed" ? "changed" : null;
  },
  async update(userId, id, { updatedAt, deadline, dueDate, dueDateEnd, recurrence, ...details }) {
    const date = (value: string | null) => value === null ? null : new Date(value);
    const result = await updateTask(userId, {
      id, ...details, deadline: date(deadline), dueDate: date(dueDate), dueDateEnd: date(dueDateEnd),
      recurrence: recurrence && { ...recurrence, until: date(recurrence.until ?? null) },
    }, { seenUpdatedAt: new Date(updatedAt) });
    return result === "updated" ? getOwnedTask(userId, id) : result === "changed" ? "changed" : null;
  },
  // Ticket 13: moves and parent changes are updateTask edits too (same rules and stale check).
  async organize(userId, id, { updatedAt, ...change }) {
    try {
      const result = await updateTask(userId, { id, ...change }, { seenUpdatedAt: new Date(updatedAt) });
      return result === "updated" ? getOwnedTask(userId, id) : result === "changed" ? "changed" : null;
    } catch (error) {
      if (error instanceof TaskOrganizationError) return error.reason === "missing" ? null : "invalid";
      throw error;
    }
  },
  remove: deleteTask,
};
