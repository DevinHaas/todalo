// Client-safe JSON contract for task reads. Pure: no database imports, so the
// shared client may import these types. Every date is an explicit ISO-8601 UTC
// instant string (or null); clients interpret it in the viewer's local zone,
// exactly as the legacy Next client did with deserialized Date objects.
export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: number;
  projectId: string | null;
  /** Section within `projectId` (always null in the Inbox). */
  sectionId: string | null;
  parentId: string | null;
  dueDate: string | null;
  dueDateEnd: string | null;
  deadline: string | null;
  completedAt: string | null;
  labelIds: string[];
  /** ADR 0001 shape; `until` is an ISO instant or null. */
  recurrence: RecurrenceDto | null;
  /** Version the editor started from; edits send it back (stale-edit check). */
  updatedAt: string | null;
  /** List indicator; absent from copies cached before comments existed. */
  commentCount?: number;
  /** Goals ticket 31: Now, Next or Later; null (or absent, older copies) is unsorted. See effectiveHorizon. */
  horizon?: Horizon | null;
  /** Ticket 31: the Plan's "oldest first". */
  createdAt?: string | null;
}

/** Goals ticket 31: where a task without a time waits (CONTEXT.md: horizon). */
export const horizons = ["now", "next", "later"] as const;
export type Horizon = typeof horizons[number];
/**
 * Ticket 31: a task is sorted once it has a horizon or a project; a sorted task
 * without a horizon counts as Next. null: unsorted (an Inbox task without one).
 */
export const effectiveHorizon = (task: { horizon?: Horizon | null; projectId: string | null }): Horizon | null => task.horizon ?? (task.projectId ? "next" : null);

export interface RecurrenceDto { n: number; unit: "day" | "week" | "month" | "year"; basedOn: "scheduled" | "completed"; until: string | null }

export interface TodayDto { tasks: TaskDto[]; openCount: number }

type DateLike = Date | string | null | undefined;
const iso = (value: DateLike) => value == null ? null : new Date(value).toISOString();

export interface TaskRecord {
  id: string; title: string; description: string | null; status: TaskDto["status"]; priority: number;
  projectId: string | null; sectionId?: string | null; parentId: string | null; dueDate: DateLike; dueDateEnd: DateLike;
  deadline: DateLike; completedAt: DateLike; labelIds: string[];
  recurrence?: { n: number; unit: RecurrenceDto["unit"]; basedOn: RecurrenceDto["basedOn"]; until?: DateLike } | null;
  updatedAt?: DateLike;
  commentCount?: number;
  horizon?: Horizon | null;
  createdAt?: DateLike;
}

/** Allow-lists fields: user IDs, calendar event IDs and sort internals never leave the server. */
export function toTaskDto(task: TaskRecord): TaskDto {
  return {
    id: task.id, title: task.title, description: task.description, status: task.status, priority: task.priority,
    projectId: task.projectId, sectionId: task.sectionId ?? null, parentId: task.parentId, dueDate: iso(task.dueDate), dueDateEnd: iso(task.dueDateEnd),
    deadline: iso(task.deadline), completedAt: iso(task.completedAt), labelIds: [...task.labelIds],
    recurrence: task.recurrence ? { n: task.recurrence.n, unit: task.recurrence.unit, basedOn: task.recurrence.basedOn, until: iso(task.recurrence.until) } : null,
    updatedAt: iso(task.updatedAt), commentCount: task.commentCount ?? 0,
    horizon: task.horizon ?? null, createdAt: iso(task.createdAt),
  };
}
