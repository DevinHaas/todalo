// Pure Ramble commit rules, shared by the database commit and the QA memory API.
import { createHash } from "node:crypto";
import type { RambleTodo } from "@todalo/ramble";
import { zonedTaskDate } from "./dates";

/** "invalid": the batch breaks a rule (400); "missing": a project is not the user's (404). */
export class RambleCommitError extends Error {
  constructor(readonly reason: "invalid" | "missing", message = reason === "missing" ? "Project unavailable" : "Invalid staged tasks") {
    super(message);
    this.name = "RambleCommitError";
  }
}

/**
 * The task ID for one staged todo of one commit operation. The primary key is
 * the operation-ID store: replaying a commit (same user, operation and staged
 * IDs) addresses the same rows, so nothing is inserted twice. The user ID is
 * hashed in, so another account's operation can never address these rows.
 */
export function rambleTaskId(userId: string, operationId: string, stagedId: string) {
  const hex = createHash("sha256").update(`${userId}\n${operationId}\n${stagedId}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function prepareTaskRows(todos: RambleTodo[], userId: string, timeZone: string, operationId: string) {
  if (todos.length > 500) throw new RambleCommitError("invalid", "Too many tasks");
  const byId = new Map(todos.map((todo) => [todo.id, todo]));
  if (byId.size !== todos.length) throw new RambleCommitError("invalid", "Duplicate staged ID");
  const id = (stagedId: string) => rambleTaskId(userId, operationId, stagedId);
  return todos.map((todo, sortOrder) => {
    if (!todo.title.trim() || todo.title.length > 4000) throw new RambleCommitError("invalid", "Invalid title");
    if ((todo.description?.length ?? 0) > 4000 || ![1, 2, 3, 4].includes(todo.priority)) throw new RambleCommitError("invalid", "Invalid task details");
    const parent = todo.parentId ? byId.get(todo.parentId) : null;
    if (todo.parentId && (!parent || parent.parentId || parent.id === todo.id)) throw new RambleCommitError("invalid", "Invalid sub-task parent");
    let dueDate: Date | null, dueDateEnd: Date | null, deadline: Date | null;
    try {
      // Matches the task editor, which stores a deadline as local midnight.
      deadline = zonedTaskDate(todo.deadline, null, timeZone);
      dueDate = zonedTaskDate(todo.dueDate, todo.startTime, timeZone);
      dueDateEnd = todo.endTime ? zonedTaskDate(todo.dueDate, todo.endTime, timeZone) : null;
      if (dueDate && dueDateEnd && dueDateEnd <= dueDate) {
        const nextDay = new Date(`${todo.dueDate}T12:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        dueDateEnd = zonedTaskDate(nextDay.toISOString().slice(0, 10), todo.endTime, timeZone);
      }
    } catch (error) {
      throw new RambleCommitError("invalid", error instanceof Error ? error.message : "Invalid captured date");
    }
    return {
      id: id(todo.id), userId, title: todo.title.trim(),
      parentId: todo.parentId ? id(todo.parentId) : null,
      projectId: todo.projectId, dueDate, dueDateEnd,
      description: todo.description?.trim() || null, priority: todo.priority, deadline,
      recurrence: todo.recurrence ? { ...todo.recurrence, until: todo.recurrence.until ? new Date(todo.recurrence.until) : null } : null, sortOrder,
    };
  });
}
