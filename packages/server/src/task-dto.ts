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
  parentId: string | null;
  dueDate: string | null;
  dueDateEnd: string | null;
  deadline: string | null;
  completedAt: string | null;
  labelIds: string[];
}

export interface TodayDto { tasks: TaskDto[]; openCount: number }

type DateLike = Date | string | null | undefined;
const iso = (value: DateLike) => value == null ? null : new Date(value).toISOString();

export interface TaskRecord {
  id: string; title: string; description: string | null; status: TaskDto["status"]; priority: number;
  projectId: string | null; parentId: string | null; dueDate: DateLike; dueDateEnd: DateLike;
  deadline: DateLike; completedAt: DateLike; labelIds: string[];
}

/** Allow-lists fields: user IDs, calendar event IDs and sort internals never leave the server. */
export function toTaskDto(task: TaskRecord): TaskDto {
  return {
    id: task.id, title: task.title, description: task.description, status: task.status, priority: task.priority,
    projectId: task.projectId, parentId: task.parentId, dueDate: iso(task.dueDate), dueDateEnd: iso(task.dueDateEnd),
    deadline: iso(task.deadline), completedAt: iso(task.completedAt), labelIds: [...task.labelIds],
  };
}
