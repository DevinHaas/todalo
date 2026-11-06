import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import type { DestinationsDto, SectionDto } from "../../../packages/server/src/project-dto";
import type { TaskOrganizationInput } from "../../../packages/server/src/organization-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import { projectKeys } from "./projects";
import { taskKeys, type TaskDto } from "./tasks";
import { taskTree, validateTaskParent } from "../../../packages/db/src/task-parent-validation";

export type { DestinationsDto, SectionDto };
/** One task's move (project + section) or parent change, with the copy it started from. */
export type TaskOrganization = TaskOrganizationInput;
/** What the user chose: a destination (Inbox is `projectId: null`) or a parent (null un-nests). */
export type OrganizationChange = { projectId: string | null; sectionId: string | null } | { parentId: string | null };

export interface OrganizationTransport {
  destinations(): Promise<DestinationsDto>;
  /** null when the project is missing or not the signed-in user's. */
  createSection(projectId: string, name: string): Promise<SectionDto | null>;
  /** false when the section is missing or not the signed-in user's (already gone). */
  removeSection(id: string): Promise<boolean>;
  /** null when the task, destination or parent is missing or not the user's; TASK_CHANGED when edited elsewhere. */
  organize(id: string, change: TaskOrganization): Promise<TaskDto | null>;
}

export function browserOrganizationTransport(fetcher: typeof fetch = fetch): OrganizationTransport {
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
  return {
    destinations: async () => {
      const destinations = await request<DestinationsDto>("GET", "/api/v1/destinations");
      if (!destinations) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return destinations;
    },
    createSection: async (projectId, name) => (await request<{ section: SectionDto }>("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/sections`, { name }))?.section ?? null,
    removeSection: async (id) => (await request<{ id: string }>("DELETE", `/api/v1/sections/${encodeURIComponent(id)}`)) !== null,
    organize: async (id, change) => (await request<{ task: TaskDto }>("PATCH", `/api/v1/tasks/${encodeURIComponent(id)}`, change))?.task ?? null,
  };
}

export function organizationTransport(): OrganizationTransport {
  if (!isTauri()) return browserOrganizationTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    destinations: () => command<DestinationsDto>("destinations"),
    createSection: async (projectId, name) => (await command<{ section: SectionDto } | null>("create_section", { projectId, name }))?.section ?? null,
    removeSection: async (id) => (await command<{ id: string } | null>("delete_section", { id })) !== null,
    organize: async (id, change) => (await command<{ task: TaskDto } | null>("organize_task", { id, change }))?.task ?? null,
  };
}

export interface Organize { task: TaskDto; change: OrganizationChange }

/** Same convention as taskKeys: every key starts with ["user", userId]. */
export const organizationKeys = {
  destinations: (userId: string) => ["user", userId, "destinations"] as const,
};

export const organizationQueries = (transport: OrganizationTransport) => ({
  destinations: (userId: string) => queryOptions({ queryKey: organizationKeys.destinations(userId), queryFn: () => transport.destinations() }),
});

// Same retry rule as task edits: a move or parent change is recognised by the
// values it already wrote, so an unclear failure may be repeated.
const retry = (failures: number, error: unknown) => failures < 2 && error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED");
const retryDelay = (failures: number) => 300 * 2 ** failures;

/**
 * Section and hierarchy writes plus the cache entries each makes stale. A move
 * also changes carried sub-tasks, and a section delete un-sections its tasks,
 * so both refresh every cached task, project and Today read. Not optimistic:
 * the legacy dialogs waited for the server too.
 */
export function organizationMutations(transport: OrganizationTransport, cache: QueryClient, userId: string) {
  const tasksChanged = () => Promise.all([
    cache.invalidateQueries({ queryKey: taskKeys.today(userId) }),
    cache.invalidateQueries({ queryKey: [...taskKeys.user(userId), "task"] }),
    cache.invalidateQueries({ queryKey: [...taskKeys.user(userId), "project"] }),
  ]);
  const sectionsChanged = (projectId: string) => Promise.all([
    cache.invalidateQueries({ queryKey: projectKeys.detail(userId, projectId) }),
    cache.invalidateQueries({ queryKey: organizationKeys.destinations(userId) }),
  ]);
  return {
    createSection: {
      mutationFn: async ({ projectId, name }: { projectId: string; name: string }) => {
        const section = await transport.createSection(projectId, name);
        if (!section) throw new AccountTransportError("PROJECT_NOT_FOUND");
        return section;
      },
      onSettled: (_section: SectionDto | undefined, _error: Error | null, { projectId }: { projectId: string }) => sectionsChanged(projectId),
    } satisfies MutationOptions<SectionDto, Error, { projectId: string; name: string }>,
    removeSection: {
      mutationFn: (section: SectionDto) => transport.removeSection(section.id),
      retry, retryDelay,
      onSettled: (_removed: boolean | undefined, _error: Error | null, section: SectionDto) => Promise.all([sectionsChanged(section.projectId), tasksChanged()]),
    } satisfies MutationOptions<boolean, Error, SectionDto>,
    organize: {
      // `updatedAt` from the copy the user acted on, so another device's change is never overwritten.
      mutationFn: async ({ task, change }: Organize) => {
        const moved = await transport.organize(task.id, { ...change, updatedAt: task.updatedAt ?? "" });
        if (!moved) throw new AccountTransportError("TASK_NOT_FOUND");
        return moved;
      },
      retry, retryDelay,
      onSuccess: (task: TaskDto) => { cache.setQueryData(taskKeys.task(userId, task.id), task); },
      onSettled: () => tasksChanged(),
    } satisfies MutationOptions<TaskDto, Error, Organize>,
  };
}

/**
 * Parents a task may nest under: open tasks of the same collection that pass
 * the server's rules (no cycles, the moved subtree within MAX_SUBTASK_DEPTH).
 */
export function parentCandidates(task: TaskDto, tasks: TaskDto[]): TaskDto[] {
  const tree = taskTree(tasks);
  return tasks.filter(item => item.id !== task.id && item.status !== "done" && item.projectId === task.projectId && fits(task, item.id, tree));
}

function fits(task: TaskDto, parentId: string, tree: ReturnType<typeof taskTree>) {
  try { validateTaskParent({ userId: "", taskId: task.id, parentId }, tree); return true; }
  catch { return false; }
}
