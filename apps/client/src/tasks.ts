import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type MutationOptions, type QueryClient, type QueryFilters, type QueryKey } from "@tanstack/react-query";
import { optimistic, type Change, type Write } from "./optimistic";
import type { RecurrenceDto, TaskDto, TodayDto } from "../../../packages/server/src/task-dto";
import type { TaskDetailsInput } from "../../../packages/server/src/task-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { Feedback } from "./feedback";
import { confirmingCriteria } from "./goals";

export type { RecurrenceDto, TaskDto, TodayDto };
/** Goals ticket 31: the horizons as the user reads them. */
export const horizonNames = { now: "Now", next: "Next", later: "Later" } as const;
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
  /** "Add sub-task" in the task sheet: nests under this task (its project and section). */
  parentId?: string;
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
  /**
   * `occurrence` is the due date the client saw; null when the task is missing or not the user's.
   * CRITERIA_OPEN: a milestone with open done criteria, unless `confirmCriteria` (which ticks them all).
   */
  complete(id: string, occurrence: string | null, operationId: string, confirmCriteria?: boolean): Promise<TaskDto | null>;
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
    if (response.status === 428) throw new AccountTransportError("CRITERIA_OPEN");
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
    complete: async (id, occurrence, operationId, confirmCriteria) => (await request<{ task: TaskDto }>("POST", `${path(id)}/complete`, { occurrence, operationId, ...(confirmCriteria && { confirmCriteria }) }))?.task ?? null,
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
    complete: async (id, occurrence, operationId, confirmCriteria) => (await command<{ task: TaskDto } | null>("complete_task", { id, occurrence, operationId, ...(confirmCriteria && { confirmCriteria }) }))?.task ?? null,
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

/**
 * Every cached read that lists tasks gets `change`: Today (the full task
 * collection) with its sidebar count, project pages, label and filter pages,
 * goal pages, and each cached task. A task the change adds or moves appears in
 * a project or label page only when it belongs there; filter and goal pages
 * keep only tasks they already listed (their membership is the server's).
 */
export function taskChanges(userId: string, change: (tasks: TaskDto[]) => TaskDto[]): Change[] {
  const user = taskKeys.user(userId);
  const open = (tasks: TaskDto[]) => tasks.filter(task => counted(task)).length;
  const lists = (member: (task: TaskDto, key: QueryKey) => boolean | undefined) => (data: { tasks?: TaskDto[] } | null | undefined, key: QueryKey) => {
    if (!data || !Array.isArray(data.tasks)) return data;
    const had = new Set(data.tasks.map(task => task.id));
    return { ...data, tasks: change(data.tasks).filter(task => member(task, key) ?? had.has(task.id)) };
  };
  return [
    { filters: { queryKey: taskKeys.today(userId), exact: true }, patch: (data: TodayDto | null | undefined) => {
      if (!data) return data;
      const tasks = change(data.tasks);
      return { tasks, openCount: data.openCount + open(tasks) - open(data.tasks) };
    } },
    { filters: { queryKey: [...user, "project"] }, patch: lists((task, key) => task.projectId === key[3]) },
    { filters: { queryKey: [...user, "metadata"] }, patch: lists((task, key) => key[3] === "label" ? task.labelIds.includes(String(key[4])) : undefined) },
    { filters: { queryKey: [...user, "goals", "detail"] }, patch: lists(() => undefined) },
    { filters: { queryKey: [...user, "task"], predicate: query => query.queryKey.length === 4 }, patch: (data: TaskDto | null | undefined) => data && (change([data]).find(task => task.id === data.id) ?? data) },
  ];
}

/** The row a create shows until the server answers (same ID: the create's operation ID). */
export function draftTask(task: NewTask, parent?: TaskDto): TaskDto {
  return {
    id: task.id, title: task.title, description: task.description ?? null, status: "todo", priority: task.priority ?? 4,
    projectId: parent ? parent.projectId : task.projectId ?? null, sectionId: parent ? parent.sectionId : task.sectionId ?? null, parentId: task.parentId ?? null,
    dueDate: task.dueDate, dueDateEnd: task.dueDateEnd ?? null, deadline: task.deadline ?? null, completedAt: null,
    labelIds: task.labelIds ?? [], recurrence: task.recurrence ?? null, updatedAt: null, commentCount: 0,
  };
}

/** Puts `task` where its placement says (top, bottom, above or below a row). */
export function placeTask(tasks: TaskDto[], task: TaskDto, placement?: Placement): TaskDto[] {
  const at = placement?.anchorId ? tasks.findIndex(item => item.id === placement.anchorId) : -1;
  if (placement?.edge === "top") return [task, ...tasks];
  if (at < 0) return [...tasks, task];
  const index = placement!.edge === "above" ? at : at + 1;
  return [...tasks.slice(0, index), task, ...tasks.slice(index)];
}

/** An edit's fields on the task (the version stays until the server answers). */
export const editedTask = (task: TaskDto, { updatedAt: _version, ...details }: TaskDetails): TaskDto => ({ ...task, ...details, recurrence: details.recurrence && { ...details.recurrence, until: details.recurrence.until ?? null }, labelIds: details.labelIds ?? task.labelIds });

/** What an edit did, for its failure toast: `move "Buy milk" to Tuesday`. */
export function editAction(before: TaskDto | undefined, details: TaskDetails, now = new Date()) {
  const name = `"${details.title}"`;
  if (!before) return `save ${name}`;
  if (before.dueDate !== details.dueDate || before.dueDateEnd !== details.dueDateEnd) {
    return details.dueDate ? `move ${name} to ${shortDateLabel(details, now)}` : `unschedule ${name}`;
  }
  if (before.title !== details.title) return `rename "${before.title}"`;
  if (before.priority !== details.priority) return `set ${name} to priority ${details.priority}`;
  if (details.labelIds && details.labelIds.join() !== before.labelIds.join()) return `change the labels of ${name}`;
  return `save your changes to ${name}`;
}

/**
 * Task writes against the user's cache, all optimistic (optimistic.ts): every
 * list showing the task changes at once and takes the server's copy when it
 * answers; a failure takes back only this write's change, and the root
 * toaster says what failed (meta.action). Reads refresh once no write is in
 * flight, so server results (a recurring task's next date) still win.
 *
 * Completion feedback plays in onMutate, with the optimistic check-off, so it
 * matches what the user sees instead of lagging by a round trip; onMutate runs
 * once per tap, not per retry. The adapter is fire-and-forget, so feedback can
 * neither delay nor fail the write; a later rollback shows the error instead.
 */
export function taskMutations(transport: TaskTransport, cache: QueryClient, userId: string, feedback?: Feedback) {
  const user = taskKeys.user(userId);
  // Today (and the sidebar count), the task, project, label/filter, search and goal reads
  // (a completed milestone ticks its criteria).
  const refresh = (id: string): QueryFilters[] => [
    { queryKey: taskKeys.today(userId) }, { queryKey: taskKeys.task(userId, id) }, { queryKey: [...user, "project"] },
    { queryKey: [...user, "metadata"] }, { queryKey: [...user, "search"] }, { queryKey: [...user, "goals"] },
  ];
  const cached = (id: string) => cache.getQueryData<TodayDto>(taskKeys.today(userId))?.tasks.find(task => task.id === id);
  const saved = (task: TaskDto) => taskChanges(userId, tasks => tasks.map(item => item.id === task.id ? task : item));
  // The task's own read gets the server copy even when it wasn't loaded yet (the sheet opens it next).
  const keep = <V,>(plan: ReturnType<typeof optimistic<V, TaskDto>>) => ({ ...plan, onSuccess: (task: TaskDto, input: V, write?: Write) => { plan.onSuccess(task, input, write); cache.setQueryData(taskKeys.task(userId, task.id), task); } });
  // Edits of one task run one at a time, and an edit based on the version this
  // client's own earlier edit replaced is rebased onto that edit's result. A
  // second drag (or any write) started before the first settled — and before
  // Today refetched — would otherwise send the old updatedAt and be refused
  // as "changed on another device". Only our own writes are skipped over: a
  // version written elsewhere still conflicts.
  // ponytail: `replaced` grows by one entry per edit for the session; fine at human edit rates.
  const running = new Map<string, Promise<unknown>>();
  const replaced = new Map<string, string>();
  const latest = (id: string, version: string) => { let current = version; while (replaced.has(`${id}@${current}`)) current = replaced.get(`${id}@${current}`)!; return current; };
  const edit = (id: string, details: TaskDetails) => {
    const run = (running.get(id) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const base = latest(id, details.updatedAt);
      const task = await transport.update(id, { ...details, updatedAt: base });
      if (!task) throw new AccountTransportError("TASK_NOT_FOUND");
      if (task.updatedAt && task.updatedAt !== base) replaced.set(`${id}@${base}`, task.updatedAt);
      return task;
    });
    const done = () => { if (running.get(id) === run) running.delete(id); };
    running.set(id, run);
    run.then(done, done);
    return run;
  };
  const completed = optimistic<Completion, TaskDto | null>(cache, {
    apply: ({ task }) => taskChanges(userId, tasks => tasks.map(item => item.id === task.id ? { ...item, status: "done" as const, completedAt: new Date().toISOString() } : item)),
    reconcile: (task) => task ? saved(task) : [],
    refresh: ({ task }) => refresh(task.id),
  });
  return {
    create: {
      mutationFn: (task: NewTask) => transport.create(task),
      retry, retryDelay,
      ...keep(optimistic<NewTask, TaskDto>(cache, {
        apply: (input) => taskChanges(userId, tasks => tasks.some(item => item.id === input.id) ? tasks : placeTask(tasks, draftTask(input, input.parentId ? cached(input.parentId) : undefined), input.placement)),
        reconcile: saved,
        refresh: (input) => refresh(input.id),
      })),
      meta: { action: (task: NewTask) => `add "${task.title}"` },
    } satisfies MutationOptions<TaskDto, Error, NewTask, Write>,
    complete: {
      mutationFn: ({ task, operationId }: Completion) => confirmingCriteria(confirm => transport.complete(task.id, task.dueDate, operationId, confirm)),
      retry, retryDelay,
      ...completed,
      onMutate: (input: Completion) => { feedback?.play("taskCompleted"); return completed.onMutate(input); },
      meta: { action: ({ task }: Completion) => `complete "${task.title}"` },
    } satisfies MutationOptions<TaskDto | null, Error, Completion, Write>,
    // Schedule drag, resize and unschedule, the editor, priority and labels.
    update: {
      mutationFn: ({ id, details }: { id: string; details: TaskDetails }) => edit(id, details),
      retry, retryDelay,
      ...keep(optimistic<{ id: string; details: TaskDetails }, TaskDto>(cache, {
        apply: ({ id, details }) => taskChanges(userId, tasks => tasks.map(item => item.id === id ? editedTask(item, details) : item)),
        // The saved copy at once too, so the next write starts from the new version.
        reconcile: saved,
        refresh: ({ id }) => refresh(id),
      })),
      meta: { action: ({ id, details }: { id: string; details: TaskDetails }) => editAction(cached(id), details) },
    } satisfies MutationOptions<TaskDto, Error, { id: string; details: TaskDetails }, Write>,
    remove: {
      mutationFn: (task: TaskDto) => transport.remove(task.id),
      retry, retryDelay,
      // Its sub-tasks go with it.
      ...optimistic<TaskDto>(cache, { apply: (task) => taskChanges(userId, tasks => tasks.filter(item => item.id !== task.id && item.parentId !== task.id)), refresh: (task) => refresh(task.id) }),
      meta: { action: (task: TaskDto) => `delete "${task.title}"` },
    } satisfies MutationOptions<boolean, Error, TaskDto, Write>,
  };
}

// Legacy date semantics (apps/web/lib/task-dates.ts): ISO instants are read in
// the viewer's local zone, exactly as the Next client did with Date objects.
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (now: Date) => { const day = new Date(now); day.setHours(0, 0, 0, 0); return day; };
export const isDueToday = (task: Pick<TaskDto, "dueDate">, now = new Date()) => task.dueDate !== null && sameDay(new Date(task.dueDate), now);
export const isOverdue = (task: Pick<TaskDto, "dueDate">, now = new Date()) =>
  task.dueDate !== null && new Date(task.dueDate) < startOfDay(now) && !isDueToday(task, now);

/** Depth-first: every task follows its visible parent, at any depth (MAX_SUBTASK_DEPTH). */
export function treeOrder<T extends { id: string; parentId: string | null }>(tasks: T[]): T[] {
  const ids = new Set(tasks.map(task => task.id));
  const seen = new Set<string>();
  const visit = (task: T): T[] => {
    if (seen.has(task.id)) return [];
    seen.add(task.id);
    return [task, ...tasks.filter(child => child.parentId === task.id).flatMap(visit)];
  };
  return tasks.filter(task => !task.parentId || !ids.has(task.parentId)).flatMap(visit);
}

/** Indent level of each row in a list: 0 unless its parent is in the same list. */
export function treeDepths(tasks: readonly { id: string; parentId: string | null }[]): Map<string, number> {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const depths = new Map<string, number>();
  const depth = (id: string, guard = 0): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const parent = byId.get(id)?.parentId;
    const value = parent && byId.has(parent) && guard < 10 ? depth(parent, guard + 1) + 1 : 0;
    depths.set(id, value);
    return value;
  };
  for (const task of tasks) depth(task.id);
  return depths;
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
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
/**
 * The row's and the task sheet's date: "Today", "Tomorrow", "Yesterday", a
 * weekday within the coming week, else "6 Nov"; then the time or time range
 * ("19:00-19:45"). With `inToday` (the Today page) an all-day today is implied:
 * "" or just the time.
 */
export function shortDateLabel(task: Pick<TaskDto, "dueDate" | "dueDateEnd">, now = new Date(), inToday = false) {
  if (!task.dueDate) return "";
  const date = new Date(task.dueDate);
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days > 1 && days < 7 ? weekday.format(date) : `${date.getDate()} ${month.format(date)}`;
  const timed = date.getHours() || date.getMinutes();
  const end = task.dueDateEnd ? new Date(task.dueDateEnd) : null;
  const time = timed ? clock(date) + (end && end > date ? `-${clock(end)}` : "") : "";
  return [inToday && days === 0 ? "" : day, time].filter(Boolean).join(" ");
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
