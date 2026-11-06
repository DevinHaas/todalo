import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalsDto } from "../../../packages/server/src/goal-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { ReorderPosition } from "./bulk";

export type { GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalsDto };
export interface GoalPatch { title?: string; description?: string; archived?: boolean }

export interface GoalTransport {
  /** Active goals in the user's order, and whether the sidebar hides them. */
  goals(): Promise<GoalsDto>;
  /** The goal page with its linked projects and tasks; null when missing or not the signed-in user's (archived goals open). */
  goal(id: string): Promise<GoalDetailDto | null>;
  create(title: string, description?: string): Promise<GoalDto>;
  /** null when the goal is missing or not the signed-in user's. */
  update(id: string, patch: GoalPatch): Promise<GoalDto | null>;
  /** false when either goal is missing, foreign or archived. */
  reorder(id: string, anchorId: string, position: ReorderPosition): Promise<boolean>;
  setHidden(hidden: boolean): Promise<boolean>;
  /** Every goal↔project and goal↔task link of the signed-in user. */
  links(): Promise<GoalLinksDto>;
  /** Links (or with `linked: false` unlinks) a project or task; false when the goal or target is missing or foreign. */
  link(id: string, kind: GoalLinkKind, targetId: string, linked: boolean): Promise<boolean>;
}

export function browserGoalTransport(fetcher: typeof fetch = fetch): GoalTransport {
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
  const path = (id: string) => `/api/v1/goals/${encodeURIComponent(id)}`;
  const required = <T,>(value: T | null, code: "TASKS_UNAVAILABLE" | "SAVE_FAILED") => { if (!value) throw new AccountTransportError(code); return value; };
  return {
    goals: async () => required(await request<GoalsDto>("GET", "/api/v1/goals"), "TASKS_UNAVAILABLE"),
    goal: (id) => request<GoalDetailDto>("GET", path(id)),
    create: async (title, description) => required(await request<{ goal: GoalDto }>("POST", "/api/v1/goals", { title, ...(description && { description }) }), "SAVE_FAILED").goal,
    update: async (id, patch) => (await request<{ goal: GoalDto }>("PATCH", path(id), patch))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await request("POST", `${path(id)}/reorder`, { anchorId, position })) !== null,
    setHidden: async (hidden) => required(await request<{ hidden: boolean }>("PUT", "/api/v1/goals-visibility", { hidden }), "SAVE_FAILED").hidden,
    links: async () => required(await request<GoalLinksDto>("GET", "/api/v1/goal-links"), "TASKS_UNAVAILABLE"),
    link: async (id, kind, targetId, linked) => (await request(linked ? "PUT" : "DELETE", `${path(id)}/${kind}/${encodeURIComponent(targetId)}`)) !== null,
  };
}

export function goalTransport(): GoalTransport {
  if (!isTauri()) return browserGoalTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    goals: () => command<GoalsDto>("goals"),
    goal: (id) => command<GoalDetailDto | null>("goal", { id }),
    create: async (title, description) => (await command<{ goal: GoalDto }>("create_goal", { title, description: description || null })).goal,
    update: async (id, patch) => (await command<{ goal: GoalDto } | null>("update_goal", { id, patch }))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await command<{ id: string } | null>("reorder_goal", { id, anchorId, position })) !== null,
    setHidden: async (hidden) => (await command<{ hidden: boolean }>("set_goals_hidden", { hidden })).hidden,
    links: () => command<GoalLinksDto>("goal_links"),
    link: async (id, kind, targetId, linked) => (await command<unknown>("link_goal", { id, kind, targetId, linked })) !== null,
  };
}

/** Same convention as taskKeys: every key starts with ["user", userId]. */
export const goalKeys = {
  all: (userId: string) => ["user", userId, "goals"] as const,
  list: (userId: string) => ["user", userId, "goals", "list"] as const,
  detail: (userId: string, id: string) => ["user", userId, "goals", "detail", id] as const,
  links: (userId: string) => ["user", userId, "goals", "links"] as const,
};

export function goalQueries(transport: GoalTransport) {
  return {
    list: (userId: string) => queryOptions({ queryKey: goalKeys.list(userId), queryFn: () => transport.goals() }),
    detail: (userId: string, id: string) => queryOptions({ queryKey: goalKeys.detail(userId, id), queryFn: () => transport.goal(id) }),
    links: (userId: string) => queryOptions({ queryKey: goalKeys.links(userId), queryFn: () => transport.links() }),
  };
}

/** Writes plus the cache entries each one makes stale (every goal read is small). */
export function goalMutations(transport: GoalTransport, cache: QueryClient, userId: string) {
  const stale = () => cache.invalidateQueries({ queryKey: goalKeys.all(userId) });
  return {
    async create(title: string, description?: string) { const goal = await transport.create(title, description); await stale(); return goal; },
    async update(id: string, patch: GoalPatch) { const goal = await transport.update(id, patch); await stale(); return goal; },
    /** A refused link (goal or target gone) is an error, so the picker shows it. */
    async link(id: string, kind: GoalLinkKind, targetId: string, linked: boolean) {
      // The checkbox moves at once; a failed save puts it back.
      const key = goalKeys.links(userId);
      const previous = cache.getQueryData<GoalLinksDto>(key);
      if (previous) cache.setQueryData(key, toggleLink(previous, id, kind, targetId, linked));
      try { if (!await transport.link(id, kind, targetId, linked)) throw new AccountTransportError("SAVE_FAILED"); }
      catch (error) { if (previous) cache.setQueryData(key, previous); throw error; }
      finally { await stale(); }
    },
    /** The sidebar moves at once; a failed save puts it back. */
    async reorder(id: string, anchorId: string, position: ReorderPosition) {
      const key = goalKeys.list(userId);
      const previous = cache.getQueryData<GoalsDto>(key);
      if (previous) cache.setQueryData(key, { ...previous, goals: moveGoal(previous.goals, id, anchorId, position) });
      try { return await transport.reorder(id, anchorId, position); }
      catch (error) { if (previous) cache.setQueryData(key, previous); throw error; }
      finally { await stale(); }
    },
    async setHidden(hidden: boolean) {
      const key = goalKeys.list(userId);
      const previous = cache.getQueryData<GoalsDto>(key);
      if (previous) cache.setQueryData(key, { ...previous, hidden });
      try { return await transport.setHidden(hidden); }
      catch (error) { if (previous) cache.setQueryData(key, previous); throw error; }
      finally { await stale(); }
    },
  };
}

/** The server's planReorder, for the optimistic sidebar. */
export function moveGoal<T extends { id: string }>(goals: T[], id: string, anchorId: string, position: ReorderPosition): T[] {
  const moving = goals.find(goal => goal.id === id);
  if (!moving || id === anchorId || !goals.some(goal => goal.id === anchorId)) return goals;
  const rest = goals.filter(goal => goal.id !== id);
  const at = rest.findIndex(goal => goal.id === anchorId) + (position === "after" ? 1 : 0);
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/** The goals linked to one project or task, from the user's links. */
export const linkedGoalIds = (links: GoalLinksDto, kind: GoalLinkKind, targetId: string) => kind === "projects"
  ? links.projects.filter(link => link.projectId === targetId).map(link => link.goalId)
  : links.tasks.filter(link => link.taskId === targetId).map(link => link.goalId);

/** The server's link/unlink, for the optimistic pickers (linking twice keeps one link). */
export function toggleLink(links: GoalLinksDto, goalId: string, kind: GoalLinkKind, targetId: string, linked: boolean): GoalLinksDto {
  if (kind === "projects") {
    const rest = links.projects.filter(link => !(link.goalId === goalId && link.projectId === targetId));
    return { ...links, projects: linked ? [...rest, { goalId, projectId: targetId }] : rest };
  }
  const rest = links.tasks.filter(link => !(link.goalId === goalId && link.taskId === targetId));
  return { ...links, tasks: linked ? [...rest, { goalId, taskId: targetId }] : rest };
}
