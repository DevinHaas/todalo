// Production binding of the task routes to the shared server operations (the
// same functions the legacy Server Actions wrap), including calendar effects.
import { getOwnedTask } from "@todalo/server/today";
import { completeTask, createTask, deleteTask, TaskIdConflictError } from "@todalo/server/tasks";
import type { TaskWrites } from "./task-routes";

export const taskOperations: Omit<TaskWrites, "allowedOrigins"> = {
  async create(userId, input) {
    try {
      const { id, created } = await createTask(userId, { ...input, dueDate: input.dueDate ?? undefined });
      const task = await getOwnedTask(userId, id);
      if (!task) throw new Error("Created task could not be read");
      return { task, created };
    } catch (error) {
      if (error instanceof TaskIdConflictError) return null;
      throw error;
    }
  },
  complete: async (userId, id, occurrence) => await completeTask(userId, id, { occurrence }) ? getOwnedTask(userId, id) : null,
  remove: deleteTask,
};
