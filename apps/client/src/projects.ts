import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { defaultProjectDisplay, type ProjectDetailDto, type ProjectDisplay, type ProjectDto, type ProjectsDto, type ProjectSummaryDto, type ProjectUpdateInput } from "../../../packages/server/src/project-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import { change, optimisticWrite } from "./optimistic";
import { taskChanges, taskKeys } from "./tasks";

export type { ProjectDetailDto, ProjectDisplay, ProjectDto, ProjectSummaryDto };
/** Add project's fields (name, colour, favorite). */
export interface NewProject { name: string; color?: string | null; favorite?: boolean }
/** Edit, favorite, archive, description, Display: only the fields given change. */
export type ProjectChange = ProjectUpdateInput;

export interface ProjectTransport {
  projects(): Promise<ProjectSummaryDto[]>;
  /** null when the project is missing or not the signed-in user's. */
  project(id: string): Promise<ProjectDetailDto | null>;
  create(project: NewProject): Promise<ProjectDto>;
  /** null when the project is missing or not the signed-in user's. */
  update(id: string, change: ProjectChange): Promise<ProjectDto | null>;
  /** false when the project is missing or not the signed-in user's. */
  remove(id: string): Promise<boolean>;
}

export function browserProjectTransport(fetcher: typeof fetch = fetch): ProjectTransport {
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
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const path = (id: string) => `/api/v1/projects/${encodeURIComponent(id)}`;
  return {
    projects: async () => {
      const list = await request<ProjectsDto>("GET", "/api/v1/projects");
      if (!list) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return list.projects;
    },
    project: (id) => request<ProjectDetailDto>("GET", path(id)),
    create: async (project) => {
      const created = await request<{ project: ProjectDto }>("POST", "/api/v1/projects", project);
      if (!created) throw new AccountTransportError("SAVE_FAILED");
      return created.project;
    },
    update: async (id, change) => (await request<{ project: ProjectDto }>("PATCH", path(id), change))?.project ?? null,
    remove: async (id) => (await request<{ id: string }>("DELETE", path(id))) !== null,
  };
}

export function projectTransport(): ProjectTransport {
  if (!isTauri()) return browserProjectTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    projects: async () => (await command<ProjectsDto>("projects")).projects,
    project: (id) => command<ProjectDetailDto | null>("project", { id }),
    create: async ({ name, color, favorite }) => (await command<{ project: ProjectDto }>("create_project", { name, color: color ?? undefined, favorite })).project,
    // Rust rebuilds the body from typed fields; "" clears the description (the server stores null).
    update: async (id, { description, ...change }) => (await command<{ project: ProjectDto } | null>("update_project", { id, change: description === undefined ? change : { ...change, description: description ?? "" } }))?.project ?? null,
    remove: async (id) => (await command<{ id: string } | null>("delete_project", { id })) !== null,
  };
}

/** Same convention as taskKeys: every key starts with ["user", userId]. */
export const projectKeys = {
  list: (userId: string) => ["user", userId, "projects"] as const,
  detail: (userId: string, id: string) => ["user", userId, "project", id] as const,
};

export function projectQueries(transport: ProjectTransport) {
  return {
    list: (userId: string) => queryOptions({ queryKey: projectKeys.list(userId), queryFn: () => transport.projects() }),
    detail: (userId: string, id: string) => queryOptions({ queryKey: projectKeys.detail(userId, id), queryFn: () => transport.project(id) }),
  };
}

let drafts = 0;
/**
 * Project writes, optimistic (optimistic.ts): the sidebar and page change at
 * once and a failure takes back only that change. Deleting moves member tasks
 * to Inbox (projectId → null), so every cached task read is then refreshed.
 */
export function projectMutations(transport: ProjectTransport, cache: QueryClient, userId: string) {
  const list = projectKeys.list(userId);
  const sidebar = (edit: (projects: ProjectSummaryDto[]) => ProjectSummaryDto[]) => change<ProjectsDto | undefined>(list, data => data && { ...data, projects: edit(data.projects) });
  // The change as the page and sidebar show it (an empty description is none).
  const shown = ({ archived, description, ...fields }: ProjectChange): Partial<ProjectDto> => ({
    ...fields, ...archived === undefined ? {} : { archived }, ...description === undefined ? {} : { description: description?.trim() ? description : null },
  });
  const edited = (id: string, edit: ProjectChange) => [
    sidebar(projects => projects.map(project => project.id === id ? { ...project, ...shown(edit) } : project)),
    change<ProjectDetailDto | null | undefined>(projectKeys.detail(userId, id), data => data && { ...data, project: { ...data.project, ...shown(edit) } }),
  ];
  const update = (id: string, edit: ProjectChange) => optimisticWrite(cache, edited(id, edit),
    async () => { const project = await transport.update(id, edit); if (!project) throw new AccountTransportError("PROJECT_NOT_FOUND"); return project; },
    [{ queryKey: list }, { queryKey: projectKeys.detail(userId, id) }, ...edit.archived === undefined ? [] : [{ queryKey: ["user", userId, "destinations"] }]]);
  return {
    create(project: NewProject) {
      const draft: ProjectSummaryDto = { id: `draft-project-${++drafts}`, name: project.name, color: project.color ?? null, description: null, favorite: project.favorite ?? false,
        archived: false, display: defaultProjectDisplay, completedCount: 0, openCount: 0 };
      return optimisticWrite(cache, [sidebar(projects => [...projects, draft])], () => transport.create(project), [{ queryKey: list }],
        created => [sidebar(projects => projects.map(item => item.id === draft.id ? { ...draft, ...created } : item))]);
    },
    rename: (id: string, name: string) => update(id, { name }),
    update,
    async remove(id: string) {
      const removed = await optimisticWrite(cache, [sidebar(projects => projects.filter(project => project.id !== id)), ...taskChanges(userId, tasks => tasks.map(task => task.projectId === id ? { ...task, projectId: null, sectionId: null } : task))],
        () => transport.remove(id), [{ queryKey: taskKeys.user(userId) }]);
      cache.removeQueries({ queryKey: projectKeys.detail(userId, id) });
      return removed;
    },
  };
}

/**
 * Display's Sorting. Server order is manual order; Array#sort is stable, so ties
 * keep it. Undated tasks sort last; "added" is newest first, as Todoist.
 */
export type ProjectSort = ProjectDisplay["sorting"];
type Sortable = { title: string; priority: number; dueDate: string | null; deadline?: string | null; createdAt?: string | null };
export function sortProjectTasks<T extends Sortable>(tasks: T[], sort: ProjectSort): T[] {
  if (sort === "manual") return tasks;
  const time = (value: string | null | undefined, newestFirst = false) => value ? (newestFirst ? -1 : 1) * Date.parse(value) : Infinity;
  const by: (a: T, b: T) => number = sort === "name" ? (a, b) => a.title.localeCompare(b.title)
    : sort === "priority" ? (a, b) => a.priority - b.priority
    : sort === "added" ? (a, b) => time(a.createdAt, true) - time(b.createdAt, true) || 0
    : (a, b) => time(sort === "date" ? a.dueDate : a.deadline) - time(sort === "date" ? b.dueDate : b.deadline) || 0; // Infinity - Infinity is NaN: undated ties
  return [...tasks].sort(by);
}

/** "Display: N": Sort and Filter choices (and Completed tasks) that differ from the defaults; the layout is not counted. */
export function displayChanges(display: ProjectDisplay): number {
  const keys = ["showCompleted", "grouping", "sorting", "date", "deadline", "created", "priority", "label"] as const;
  return keys.filter(key => display[key] !== defaultProjectDisplay[key]).length;
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** Whether a date falls in a Display window, by local calendar day. */
function inWindow(value: string | null | undefined, window: "today" | "week" | "month" | "overdue" | "any" | "none", now: Date, past = false) {
  if (window === "none") return !value;
  if (!value) return false;
  if (window === "any") return true;
  const day = startOfDay(new Date(value)).getTime(), today = startOfDay(now).getTime();
  if (window === "overdue") return day < today;
  if (window === "today") return day === today;
  // "week"/"month": the next 7 days (dates, deadlines) or the last 7/30 days (created).
  const span = window === "week" ? 7 : 30;
  return past ? day <= today && day > addDays(now, -span).getTime() : day <= addDays(now, span - 1).getTime() && day >= today;
}

type Filterable = Sortable & { status: string; labelIds: string[] };
/** Display's Completed tasks switch and Filter choices (Date, Deadline, Created, Priority, Label). A date filter also shows overdue for "Today"/"This week", as Todoist. */
export function filterProjectTasks<T extends Filterable>(tasks: T[], display: ProjectDisplay, now = new Date()): T[] {
  return tasks.filter(task => (display.showCompleted || task.status !== "done")
    && (display.date === "all" || inWindow(task.dueDate, display.date, now) || (display.date !== "none" && display.date !== "overdue" && inWindow(task.dueDate, "overdue", now)))
    && (display.deadline === "all" || inWindow(task.deadline, display.deadline, now))
    && (display.created === "all" || inWindow(task.createdAt, display.created, now, true))
    && (display.priority === "all" || task.priority === Number(display.priority))
    && (display.label === "all" || task.labelIds.includes(display.label)));
}

const dayTitle = (value: string, now: Date) => {
  const day = startOfDay(new Date(value)), today = startOfDay(now);
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === addDays(now, 1).getTime()) return "Tomorrow";
  return day.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", ...day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" } });
};
export interface TaskGroup<T> { key: string; title: string; tasks: T[] }
/**
 * Display's Grouping other than sections (None groups by section: sectionGroups).
 * Sub-tasks stay with their top-level task's group; a task with several labels
 * is listed under each. Groups keep the order of their first task, except the
 * fixed orders (priority, dates ascending, "No date" last).
 */
export function groupProjectTasks<T extends Filterable & { id: string; parentId: string | null }>(tasks: T[], grouping: Exclude<ProjectDisplay["grouping"], "none">, labels: { id: string; name: string }[], now = new Date()): TaskGroup<T>[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const root = (task: T) => { let current = task; for (let guard = 0; current.parentId && byId.has(current.parentId) && guard < 10; guard++) current = byId.get(current.parentId)!; return current; };
  const dated = (value: string | null | undefined, none: string): [string, string][] => {
    if (!value) return [["~none", none]];
    if (grouping !== "added" && inWindow(value, "overdue", now)) return [["0-overdue", "Overdue"]];
    const day = startOfDay(new Date(value));
    return [[`1-${day.getTime().toString().padStart(15, "0")}`, dayTitle(value, now)]];
  };
  const keys = (task: T): [string, string][] => grouping === "priority" ? [[`p${task.priority}`, `Priority ${task.priority}`]]
    : grouping === "label" ? task.labelIds.length ? task.labelIds.map(id => [`l-${id}`, labels.find(label => label.id === id)?.name ?? "Label"]) : [["~none", "No label"]]
    : grouping === "date" ? dated(task.dueDate, "No date") : grouping === "deadline" ? dated(task.deadline, "No deadline") : dated(task.createdAt, "No date");
  const groups = new Map<string, TaskGroup<T>>();
  for (const task of tasks) for (const [key, title] of keys(root(task))) {
    if (!groups.has(key)) groups.set(key, { key, title, tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  const ordered = [...groups.values()];
  if (grouping === "label") return ordered.sort((a, b) => Number(a.key === "~none") - Number(b.key === "~none") || a.title.localeCompare(b.title));
  // Added: newest day first; otherwise ascending (Overdue first). "No date" last either way.
  return ordered.sort((a, b) => a.key.startsWith("~") ? 1 : b.key.startsWith("~") ? -1 : grouping === "added" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
}
