// Production binding of the task routes to the shared server operations (the
// same functions the legacy Server Actions wrap), including calendar effects.
import { getOwnedTask, taskExtras } from "@todalo/server/today";
import { completeTask, createTask, deleteTask, TaskIdConflictError, updateTask } from "@todalo/server/tasks";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import type { TaskWrites } from "./task-routes";

/** The row a write returned (tasks.ts `written` callbacks). */
type Written = Parameters<NonNullable<Parameters<typeof completeTask>[3]>>[0];

export const taskOperations: Omit<TaskWrites, "allowedOrigins"> = {
  async create(userId, input) {
    try {
      // createTaskInput coerces the ISO strings (dueDateEnd, recurrence.until) to dates.
      const { id, created, task: row } = await createTask(userId, { ...input, dueDate: input.dueDate ?? undefined });
      // A new task has no comments and only the labels it was given: answered without reading it back.
      const task = created && row ? { ...row, commentCount: 0, labelIds: input.labelIds ?? [] } : await getOwnedTask(userId, id);
      if (!task) throw new Error("Created task could not be read");
      return { task, created };
    } catch (error) {
      if (error instanceof TaskIdConflictError) return null;
      throw error;
    }
  },
  async complete(userId, id, request) {
    // The written row plus its labels and comment count (read alongside the write, which changes
    // neither): one round trip fewer than reading the task back.
    let written: Written | undefined;
    const [result, extras] = await Promise.all([completeTask(userId, id, request, row => { written = row; }), taskExtras(userId, id)]);
    if (result !== "completed") return result === "changed" || result === "criteria" ? result : null;
    return written ? { ...written, ...extras } : getOwnedTask(userId, id);
  },
  async update(userId, id, { updatedAt, deadline, dueDate, dueDateEnd, recurrence, ...details }) {
    const date = (value: string | null) => value === null ? null : new Date(value);
    let written: Written | undefined;
    const [result, extras] = await Promise.all([updateTask(userId, {
      id, ...details, deadline: date(deadline), dueDate: date(dueDate), dueDateEnd: date(dueDateEnd),
      recurrence: recurrence && { ...recurrence, until: date(recurrence.until ?? null) },
    }, { seenUpdatedAt: new Date(updatedAt) }, row => { written = row; }), taskExtras(userId, id)]);
    if (result !== "updated") return result === "changed" ? "changed" : null;
    // Read alongside the write, so labels it set come from the input (deduplicated as stored).
    return written ? { ...written, ...extras, ...(details.labelIds !== undefined && { labelIds: [...new Set(details.labelIds)] }) } : getOwnedTask(userId, id);
  },
  // Ticket 13: moves and parent changes are updateTask edits too (same rules and stale check).
  async organize(userId, id, { updatedAt, ...change }) {
    try {
      let written: Written | undefined;
      const [result, extras] = await Promise.all([updateTask(userId, { id, ...change }, { seenUpdatedAt: new Date(updatedAt) }, row => { written = row; }), taskExtras(userId, id)]);
      if (result !== "updated") return result === "changed" ? "changed" : null;
      return written ? { ...written, ...extras } : getOwnedTask(userId, id);
    } catch (error) {
      if (error instanceof TaskOrganizationError) return error.reason === "missing" ? null : "invalid";
      throw error;
    }
  },
  remove: deleteTask,
};
