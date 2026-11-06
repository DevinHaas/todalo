import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ProjectDetailDto, ProjectDto, ProjectsDto } from "../../../packages/server/src/project-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import { taskKeys } from "./tasks";

export type { ProjectDetailDto, ProjectDto };

export interface ProjectTransport {
  projects(): Promise<ProjectDto[]>;
  /** null when the project is missing or not the signed-in user's. */
  project(id: string): Promise<ProjectDetailDto | null>;
  create(name: string): Promise<ProjectDto>;
  /** null when the project is missing or not the signed-in user's. */
  rename(id: string, name: string): Promise<ProjectDto | null>;
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
    create: async (name) => {
      const created = await request<{ project: ProjectDto }>("POST", "/api/v1/projects", { name });
      if (!created) throw new AccountTransportError("SAVE_FAILED");
      return created.project;
    },
    rename: async (id, name) => (await request<{ project: ProjectDto }>("PATCH", path(id), { name }))?.project ?? null,
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
    create: async (name) => (await command<{ project: ProjectDto }>("create_project", { name })).project,
    rename: async (id, name) => (await command<{ project: ProjectDto } | null>("rename_project", { id, name }))?.project ?? null,
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

/** Writes plus the cache entries each one makes stale. */
export function projectMutations(transport: ProjectTransport, cache: QueryClient, userId: string) {
  return {
    async create(name: string) {
      const project = await transport.create(name);
      await cache.invalidateQueries({ queryKey: projectKeys.list(userId) });
      return project;
    },
    async rename(id: string, name: string) {
      const project = await transport.rename(id, name);
      await Promise.all([
        cache.invalidateQueries({ queryKey: projectKeys.list(userId) }),
        cache.invalidateQueries({ queryKey: projectKeys.detail(userId, id) }),
      ]);
      return project;
    },
    // Deleting moves member tasks to Inbox (projectId → null), so every cached
    // task read for this user is stale; the Today count itself is unchanged.
    async remove(id: string) {
      const removed = await transport.remove(id);
      cache.removeQueries({ queryKey: projectKeys.detail(userId, id) });
      await cache.invalidateQueries({ queryKey: taskKeys.user(userId) });
      return removed;
    },
  };
}

/**
 * Legacy ProjectView sort: page state only (not saved, Manual on every visit).
 * Server order is manual order; Array#sort is stable, so ties keep it.
 */
export type ProjectSort = "manual" | "date" | "name" | "priority";
export function sortProjectTasks<T extends { title: string; priority: number; dueDate: string | null }>(tasks: T[], sort: ProjectSort): T[] {
  if (sort === "manual") return tasks;
  const due = (task: T) => task.dueDate ? Date.parse(task.dueDate) : Infinity;
  return [...tasks].sort((a, b) => sort === "name" ? a.title.localeCompare(b.title)
    : sort === "priority" ? a.priority - b.priority
    : due(a) - due(b) || 0); // Infinity - Infinity is NaN: undated ties
}
