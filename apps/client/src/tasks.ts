import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import type { RecurrenceDto, TaskDto, TodayDto } from "../../../packages/server/src/task-dto";
import type { TaskDetailsInput } from "../../../packages/server/src/task-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { Feedback } from "./feedback";

export type { RecurrenceDto, TaskDto, TodayDto };
/** Everything the edit dialog saves (ticket 11), with the version it started from. */
export type TaskDetails = TaskDetailsInput;
/** One completion tap; the operation ID is reused by that tap's retries. */
export interface Completion { task: TaskDto; operationId: string }

/** A basic task (ticket 5): Today when dueDate is set, otherwise Inbox. */
export interface NewTask {
  /** Client-generated operation ID: retrying the same create returns the same task. */
  id: string;
  title: string;
  description?: string;
  dueDate: string | null;
  /** End of a schedule slot (ticket 16) or quick add's detected end time (ticket 12). */
  dueDateEnd?: string | null;
  /** Quick add's detected or picked repeat (ticket 12, ADR 0001). */
  recurrence?: RecurrenceDto | null;
  /** The composer's destination (project view, project picker); omitted is the Inbox. */
  projectId?: string | null;
  sectionId?: string | null;
  /** The legacy composer's Additional actions. */
  priority?: number;
  deadline?: string | null;
  labelIds?: string[];
  /** Where the new task goes in its project's manual order (add top/bottom, Save and add above/below). */
  placement?: Placement;
}
export interface Placement { edge: "top" | "bottom" | "above" | "below"; anchorId?: string }

export interface TaskTransport {
  today(): Promise<TodayDto>;
  /** null when the task is missing or not the signed-in user's. */
  task(id: string): Promise<TaskDto | null>;
  create(task: NewTask): Promise<TaskDto>;
  /** `occurrence` is the due date the client saw; null when the task is missing or not the user's. */
  complete(id: string, occurrence: string | null, operationId: string): Promise<TaskDto | null>;
  /** null when the task is missing or not the user's; TASK_CHANGED when edited elsewhere. */
  update(id: string, details: TaskDetails): Promise<TaskDto | null>;
  /** false when the task is missing or not the signed-in user's (already gone). */
  remove(id: string): Promise<boolean>;
}

export function browserTaskTransport(fetcher: typeof fetch = fetch): TaskTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      // Same-origin cookie session; the API also checks Origin on writes.
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 412) throw new AccountTransportError("TASK_CHANGED");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const path = (id: string) => `/api/v1/tasks/${encodeURIComponent(id)}`;
  return {
    today: async () => {
      const today = await request<TodayDto>("GET", "/api/v1/today");
      if (!today) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return today;
    },
    task: async (id) => (await request<{ task: TaskDto }>("GET", path(id)))?.task ?? null,
    create: async (task) => {
      const created = await request<{ task: TaskDto }>("POST", "/api/v1/tasks", task);
      if (!created) throw new AccountTransportError("SAVE_FAILED");
      return created.task;
    },
    complete: async (id, occurrence, operationId) => (await request<{ task: TaskDto }>("POST", `${path(id)}/complete`, { occurrence, operationId }))?.task ?? null,
    update: async (id, details) => (await request<{ task: TaskDto }>("PATCH", path(id), details))?.task ?? null,
    remove: async (id) => (await request<{ id: string }>("DELETE", path(id))) !== null,
  };
}

export function taskTransport(): TaskTransport {
  if (!isTauri()) return browserTaskTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer token.
  return {
    today: () => command<TodayDto>("today"),
    task: async (id) => (await command<{ task: TaskDto } | null>("task", { id }))?.task ?? null,
    create: async (task) => (await command<{ task: TaskDto }>("create_task", { task })).task,
    complete: async (id, occurrence, operationId) => (await command<{ task: TaskDto } | null>("complete_task", { id, occurrence, operationId }))?.task ?? null,
    update: async (id, details) => (await command<{ task: TaskDto } | null>("update_task", { id, details }))?.task ?? null,
    remove: async (id) => (await command<{ id: string } | null>("delete_task", { id })) !== null,
  };
}

/** Query-key convention: every user-scoped key starts with ["user", userId] so an
 * account switch can never read another user's cache entry, and logout clears all. */
export const taskKeys = {
  user: (userId: string) => ["user", userId] as const,
  today: (userId: string) => ["user", userId, "today"] as const,
  task: (userId: string, id: string) => ["user", userId, "task", id] as const,
};

export function taskQueries(transport: TaskTransport) {
  return {
    today: (userId: string) => queryOptions({ queryKey: taskKeys.today(userId), queryFn: () => transport.today() }),
    task: (userId: string, id: string) => queryOptions({ queryKey: taskKeys.task(userId, id), queryFn: () => transport.task(id) }),
  };
}

/** Random v4 UUID without requiring a secure context (crypto.randomUUID does). */
export function operationId(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = random(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Only failures that may hide an applied write are retried: no response, or a
// server error. Each is safe to repeat: create carries its operation ID,
// completion its occurrence and tap ID, an edit is recognised by the values it
// already wrote, and a repeated delete finds the task gone.
const ambiguous = (error: unknown) => error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED");
const retry = (failures: number, error: unknown) => failures < 2 && ambiguous(error);
const retryDelay = (failures: number) => 300 * 2 ** failures;

/** Legacy count rule (packages/server countTodayTasks): open, dated, due before tomorrow. */
const counted = (task: TaskDto, now = new Date()) => {
  const tomorrow = startOfDay(now); tomorrow.setDate(tomorrow.getDate() + 1);
  return task.status !== "done" && task.dueDate !== null && new Date(task.dueDate) < tomorrow;
};

type Snapshot = { previous?: TodayDto };

/**
 * Task writes against the user's cache. Completion and deletion apply
 * optimistically to Today (list and sidebar count) and roll back on failure;
 * every write then refetches Today and the task so server results (such as a
 * recurring task's next date) win.
 *
 * Completion feedback plays in onMutate, with the optimistic check-off, so it
 * matches what the user sees instead of lagging by a round trip; onMutate runs
 * once per tap, not per retry. The adapter is fire-and-forget, so feedback can
 * neither delay nor fail the write; a later rollback shows the error instead.
 */
export function taskMutations(transport: TaskTransport, cache: QueryClient, userId: string, feedback?: Feedback) {
  const today = taskKeys.today(userId);
  // Today (and the sidebar count), the task, and every open project list.
  const settle = (id: string) => Promise.all([
    cache.invalidateQueries({ queryKey: today }),
    cache.invalidateQueries({ queryKey: taskKeys.task(userId, id) }),
    cache.invalidateQueries({ queryKey: [...taskKeys.user(userId), "project"] }),
    // Label and saved-filter task lists (metadataKeys.all, ticket 14).
    cache.invalidateQueries({ queryKey: [...taskKeys.user(userId), "metadata"] }),
    // Search results and Quick Find items (searchKeys.all, ticket 18).
    cache.invalidateQueries({ queryKey: [...taskKeys.user(userId), "search"] }),
  ]);
  async function optimistic(task: TaskDto, change: (tasks: TaskDto[]) => TaskDto[]): Promise<Snapshot> {
    await cache.cancelQueries({ queryKey: today });
    const previous = cache.getQueryData<TodayDto>(today);
    if (previous) {
      const was = previous.tasks.find(item => item.id === task.id);
      cache.setQueryData<TodayDto>(today, { tasks: change(previous.tasks), openCount: previous.openCount - (was && counted(was) ? 1 : 0) });
    }
    return { previous };
  }
  const rollback = (_error: Error, _input: unknown, snapshot?: Snapshot) => { if (snapshot?.previous) cache.setQueryData(today, snapshot.previous); };
  return {
    create: {
      mutationFn: (task: NewTask) => transport.create(task),
      retry, retryDelay,
      onSuccess: (task: TaskDto) => { cache.setQueryData(taskKeys.task(userId, task.id), task); },
      onSettled: (_task: TaskDto | undefined, _error: Error | null, input: NewTask) => settle(input.id),
    } satisfies MutationOptions<TaskDto, Error, NewTask>,
    complete: {
      mutationFn: ({ task, operationId }: Completion) => transport.complete(task.id, task.dueDate, operationId),
      retry, retryDelay,
      onMutate: ({ task }: Completion) => {
        feedback?.play("taskCompleted");
        return optimistic(task, tasks => tasks.map(item => item.id === task.id ? { ...item, status: "done" as const, completedAt: new Date().toISOString() } : item));
      },
      onError: rollback,
      onSettled: (_result: unknown, _error: Error | null, { task }: Completion) => settle(task.id),
    } satisfies MutationOptions<TaskDto | null, Error, Completion, Snapshot>,
    // Not optimistic (the legacy dialog waited too); the editor keeps its draft until saved.
    update: {
      mutationFn: async ({ id, details }: { id: string; details: TaskDetails }) => {
        const task = await transport.update(id, details);
        if (!task) throw new AccountTransportError("TASK_NOT_FOUND");
        return task;
      },
      retry, retryDelay,
      onSuccess: (task: TaskDto) => { cache.setQueryData(taskKeys.task(userId, task.id), task); },
      onSettled: (_task: TaskDto | undefined, _error: Error | null, { id }: { id: string }) => settle(id),
    } satisfies MutationOptions<TaskDto, Error, { id: string; details: TaskDetails }>,
    remove: {
      mutationFn: (task: TaskDto) => transport.remove(task.id),
      retry, retryDelay,
      onMutate: (task: TaskDto) => optimistic(task, tasks => tasks.filter(item => item.id !== task.id)),
      onError: rollback,
      onSettled: (_result: unknown, _error: Error | null, task: TaskDto) => settle(task.id),
    } satisfies MutationOptions<boolean, Error, TaskDto, Snapshot>,
  };
}

// Legacy date semantics (apps/web/lib/task-dates.ts): ISO instants are read in
// the viewer's local zone, exactly as the Next client did with Date objects.
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (now: Date) => { const day = new Date(now); day.setHours(0, 0, 0, 0); return day; };
export const isDueToday = (task: Pick<TaskDto, "dueDate">, now = new Date()) => task.dueDate !== null && sameDay(new Date(task.dueDate), now);
export const isOverdue = (task: Pick<TaskDto, "dueDate">, now = new Date()) =>
  task.dueDate !== null && new Date(task.dueDate) < startOfDay(now) && !isDueToday(task, now);

// Copy of apps/web/lib/task-keyboard.ts taskTreeOrder: children follow their visible parent.
export function treeOrder<T extends { id: string; parentId: string | null }>(tasks: T[]): T[] {
  const ids = new Set(tasks.map(task => task.id));
  return tasks.filter(task => !task.parentId || !ids.has(task.parentId)).flatMap(task => [task, ...tasks.filter(child => child.parentId === task.id)]);
}

/** Today list groups; completed tasks are hidden unless Display shows them (legacy default off). */
export function todaySections(tasks: TaskDto[], now = new Date(), showCompleted = false) {
  const open = showCompleted ? tasks : tasks.filter(task => task.status !== "done");
  return { overdue: treeOrder(open.filter(task => isOverdue(task, now))), today: treeOrder(open.filter(task => isDueToday(task, now))) };
}

const month = new Intl.DateTimeFormat("en-US", { month: "short" });
const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const pad = (value: number) => String(value).padStart(2, "0");
/** date-fns "d MMM" / "d MMM HH:mm" as used by the legacy DatePill. */
export function dueLabel(value: string) {
  const date = new Date(value);
  const day = `${date.getDate()} ${month.format(date)}`;
  return date.getHours() || date.getMinutes() ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}
/** Legacy Today heading: "4 Oct · Today · Sunday". */
export const todayHeading = (now = new Date()) => `${now.getDate()} ${month.format(now)} · Today · ${weekday.format(now)}`;
/** Legacy taskDateLabel in the viewer's zone, used for deadlines. */
export const deadlineLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

// Edit-form values in the viewer's zone, as the legacy dialog read and wrote them
// (task-metadata-fields dateInputValue/dateInputDate, task-dates combineDateAndTime).
const local = (value: string) => new Date(value);
/** `<input type="date">` value, or "". */
export const dateInputValue = (value: string | null) => {
  if (!value) return "";
  const date = local(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** "HH:mm", or "" when `allDay` and the instant is local midnight (legacy hasDueTime). */
export const timeInputValue = (value: string | null, allDay = true) => {
  if (!value) return "";
  const date = local(value);
  return allDay && !date.getHours() && !date.getMinutes() ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
/** A local calendar date plus optional "HH:mm" as an ISO instant. */
export function localInstant(date: string, time = "") {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time ? time.split(":").map(Number) : [0, 0];
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

/** The legacy edit dialog's Repeat presets (ADR 0001 shape). */
export const repeatPresets = {
  daily: { n: 1, unit: "day", basedOn: "scheduled", until: null },
  weekly: { n: 1, unit: "week", basedOn: "scheduled", until: null },
  monthly: { n: 1, unit: "month", basedOn: "scheduled", until: null },
} as const satisfies Record<string, RecurrenceDto>;
export type RepeatChoice = "none" | keyof typeof repeatPresets | "custom";
export function repeatChoice(recurrence: RecurrenceDto | null): RepeatChoice {
  if (!recurrence) return "none";
  const preset = (Object.keys(repeatPresets) as (keyof typeof repeatPresets)[]).find(key => {
    const value = repeatPresets[key];
    return value.n === recurrence.n && value.unit === recurrence.unit && value.basedOn === recurrence.basedOn && !recurrence.until;
  });
  return preset ?? "custom";
}
/** "Every 3 days after completion until 31 Dec 2026". */
export function repeatLabel({ n, unit, basedOn, until }: RecurrenceDto) {
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  return `${every}${basedOn === "completed" ? " after completion" : ""}${until ? ` until ${deadlineLabel(until)}` : ""}`;
}
