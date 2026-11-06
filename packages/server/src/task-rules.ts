// Pure completion and edit rules (no database), shared by @todalo/server/tasks
// and the disposable QA API so both apply exactly the same decisions.
import { nextOccurrenceOnCompletion, type Recurrence } from "@todalo/ramble/recurrence";

type Status = "todo" | "in_progress" | "done";
export interface CompletionTarget {
  status: Status;
  dueDate: Date | null;
  recurrence: Recurrence | null;
  lastCompletionId?: string | null;
}
export interface CompletionRequest {
  /** The due date the caller saw (null for an undated task). */
  occurrence?: Date | null;
  /** Client-generated per tap and reused on retries of that tap. */
  operationId?: string;
  /** Goals ticket 06: completes a milestone with open done criteria, ticking them all. */
  confirmCriteria?: boolean;
}
export type CompletionPatch = { status?: "done"; completedAt: Date | null; dueDate?: Date; lastCompletionId: string | null };
export type CompletionPlan =
  /** Already done, or this exact completion was already applied: nothing to write. */
  | { kind: "unchanged" }
  /** The task moved to another date (another device's edit or completion) since the caller read it. */
  | { kind: "changed" }
  | { kind: "write"; patch: CompletionPatch };

const time = (value: Date | null | undefined) => value?.getTime() ?? null;

/**
 * Legacy completion (ADR 0001 recurrence shape): a recurring task advances via
 * `nextOccurrenceOnCompletion` in the server's local zone, keeping
 * `dueDateEnd`; a passed `until` completes it instead. A request without an
 * occurrence (the legacy Server Actions) always applies.
 *
 * Replays: the operation ID recorded on the task identifies a retry after the
 * task has already moved on. A stale occurrence with an operation ID is
 * `changed`; without one (ticket 5 clients) it stays a silent no-op, because a
 * replay and a stale read cannot be told apart.
 */
export function planCompletion(task: CompletionTarget, request: CompletionRequest = {}, now = new Date()): CompletionPlan {
  if (request.operationId && task.lastCompletionId === request.operationId) return { kind: "unchanged" };
  if (task.status === "done") return { kind: "unchanged" };
  if (request.occurrence !== undefined && time(task.dueDate) !== time(request.occurrence)) {
    return request.operationId ? { kind: "changed" } : { kind: "unchanged" };
  }
  const lastCompletionId = request.operationId ?? null;
  const next = task.recurrence ? nextOccurrenceOnCompletion(task.dueDate, now, task.recurrence) : null;
  return next
    ? { kind: "write", patch: { dueDate: next, completedAt: null, lastCompletionId } }
    : { kind: "write", patch: { status: "done", completedAt: now, lastCompletionId } };
}

// Comparable form of a stored or requested value: dates by instant, recurrence
// by its fields (jsonb reorders keys and returns `until` as a string).
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "unit" in value) {
    const { n, unit, basedOn, until } = value as Recurrence;
    return JSON.stringify([n, unit, basedOn, until ? new Date(until).getTime() : null]);
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return value ?? null;
}

/**
 * An edit based on an older copy (`seenUpdatedAt` differs from the task's) is
 * refused so another device's change is never silently overwritten — unless
 * the task already holds every requested value, i.e. this edit was applied and
 * its response lost. Callers without `seenUpdatedAt` keep last-write-wins.
 */
export function editConflicts(task: Record<string, unknown> & { updatedAt: Date }, changes: Record<string, unknown>, seenUpdatedAt?: Date): boolean {
  if (!seenUpdatedAt || task.updatedAt.getTime() === seenUpdatedAt.getTime()) return false;
  return Object.entries(changes).some(([key, value]) => comparable(task[key]) !== comparable(value));
}
