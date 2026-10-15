import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions } from "@tanstack/react-query";
import type { TaskDto, TodayDto } from "../../../packages/server/src/task-dto";
import { AccountTransportError, nativeAccountError } from "./errors";

export type { TaskDto, TodayDto };

export interface TaskTransport {
  today(): Promise<TodayDto>;
  /** null when the task is missing or not the signed-in user's. */
  task(id: string): Promise<TaskDto | null>;
}

export function browserTaskTransport(fetcher: typeof fetch = fetch): TaskTransport {
  async function get<T>(path: string): Promise<T | null> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store" }); }
    catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (!response.ok) throw new AccountTransportError("TASKS_UNAVAILABLE");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    today: async () => {
      const today = await get<TodayDto>("/api/v1/today");
      if (!today) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return today;
    },
    task: async (id) => (await get<{ task: TaskDto }>(`/api/v1/tasks/${encodeURIComponent(id)}`))?.task ?? null,
  };
}

export function taskTransport(): TaskTransport {
  if (!isTauri()) return browserTaskTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per read; Rust attaches the Keychain bearer token.
  return {
    today: () => command<TodayDto>("today"),
    task: async (id) => (await command<{ task: TaskDto } | null>("task", { id }))?.task ?? null,
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

// Legacy date semantics (apps/web/lib/task-dates.ts): ISO instants are read in
// the viewer's local zone, exactly as the Next client did with Date objects.
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (now: Date) => { const day = new Date(now); day.setHours(0, 0, 0, 0); return day; };
export const isDueToday = (task: Pick<TaskDto, "dueDate">, now = new Date()) => task.dueDate !== null && sameDay(new Date(task.dueDate), now);
export const isOverdue = (task: Pick<TaskDto, "dueDate">, now = new Date()) =>
  task.dueDate !== null && new Date(task.dueDate) < startOfDay(now) && !isDueToday(task, now);

// Copy of apps/web/lib/task-keyboard.ts taskTreeOrder: children follow their visible parent.
function treeOrder<T extends { id: string; parentId: string | null }>(tasks: T[]): T[] {
  const ids = new Set(tasks.map(task => task.id));
  return tasks.filter(task => !task.parentId || !ids.has(task.parentId)).flatMap(task => [task, ...tasks.filter(child => child.parentId === task.id)]);
}

/** Today list groups with completed tasks hidden (legacy display default). */
export function todaySections(tasks: TaskDto[], now = new Date()) {
  const open = tasks.filter(task => task.status !== "done");
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
