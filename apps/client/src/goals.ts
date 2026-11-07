import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CriterionDto, GoalColor, GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalMilestoneDto, GoalsDto, GoalSuggestionsDto, MilestoneDto } from "../../../packages/server/src/goal-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { ReorderPosition } from "./bulk";

export type { CriterionDto, GoalColor, GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalMilestoneDto, GoalsDto, GoalSuggestionsDto, MilestoneDto };
export { goalColorKeys, goalColorValue, nextGoalColor } from "../../../packages/server/src/goal-dto";
export interface GoalPatch { title?: string; description?: string; color?: GoalColor; archived?: boolean }
/** A new goal; without a colour the server picks the next palette one. */
export interface NewGoal { title: string; description?: string; color?: GoalColor }

export interface GoalTransport {
  /** Active goals in the user's order, and whether the sidebar hides them. */
  goals(): Promise<GoalsDto>;
  /** The goal page with its linked projects and tasks; null when missing or not the signed-in user's (archived goals open). */
  goal(id: string): Promise<GoalDetailDto | null>;
  create(goal: NewGoal): Promise<GoalDto>;
  /** null when the goal is missing or not the signed-in user's. */
  update(id: string, patch: GoalPatch): Promise<GoalDto | null>;
  /** false when either goal is missing, foreign or archived. */
  reorder(id: string, anchorId: string, position: ReorderPosition): Promise<boolean>;
  setHidden(hidden: boolean): Promise<boolean>;
  /** Every goal↔project and goal↔task link of the signed-in user. */
  links(): Promise<GoalLinksDto>;
  /** Links (or with `linked: false` unlinks) a project or task; false when the goal or target is missing or foreign. */
  link(id: string, kind: GoalLinkKind, targetId: string, linked: boolean): Promise<boolean>;
  /** Goals suggested for a task, best first (ticket 03); null when the task is missing or foreign. */
  suggestions(taskId: string): Promise<GoalSuggestionsDto | null>;
  /** Hides one suggestion for one task (never links); false when the task or goal is missing or foreign. */
  dismiss(taskId: string, goalId: string): Promise<boolean>;
  /** Ticket 06: the task's milestone; null when it is not one (or the task is missing or foreign). */
  milestone(taskId: string): Promise<MilestoneDto | null>;
  /** Marks or edits (replacing the criteria), or with null unmarks; false when the task is missing or foreign. */
  setMilestone(taskId: string, milestone: MilestoneDto | null): Promise<boolean>;
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
    if (response.status === 409) throw new AccountTransportError("GOAL_NOT_LINKED");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const path = (id: string) => `/api/v1/goals/${encodeURIComponent(id)}`;
  const required = <T,>(value: T | null, code: "TASKS_UNAVAILABLE" | "SAVE_FAILED") => { if (!value) throw new AccountTransportError(code); return value; };
  return {
    goals: async () => required(await request<GoalsDto>("GET", "/api/v1/goals"), "TASKS_UNAVAILABLE"),
    goal: (id) => request<GoalDetailDto>("GET", path(id)),
    create: async ({ title, description, color }) => required(await request<{ goal: GoalDto }>("POST", "/api/v1/goals", { title, ...(description && { description }), ...(color && { color }) }), "SAVE_FAILED").goal,
    update: async (id, patch) => (await request<{ goal: GoalDto }>("PATCH", path(id), patch))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await request("POST", `${path(id)}/reorder`, { anchorId, position })) !== null,
    setHidden: async (hidden) => required(await request<{ hidden: boolean }>("PUT", "/api/v1/goals-visibility", { hidden }), "SAVE_FAILED").hidden,
    links: async () => required(await request<GoalLinksDto>("GET", "/api/v1/goal-links"), "TASKS_UNAVAILABLE"),
    link: async (id, kind, targetId, linked) => (await request(linked ? "PUT" : "DELETE", `${path(id)}/${kind}/${encodeURIComponent(targetId)}`)) !== null,
    suggestions: (taskId) => request<GoalSuggestionsDto>("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}/goal-suggestions`),
    dismiss: async (taskId, goalId) => (await request("DELETE", `/api/v1/tasks/${encodeURIComponent(taskId)}/goal-suggestions/${encodeURIComponent(goalId)}`)) !== null,
    milestone: async (taskId) => (await request<{ milestone: MilestoneDto | null }>("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}/milestone`))?.milestone ?? null,
    setMilestone: async (taskId, milestone) => (await request(milestone ? "PUT" : "DELETE", `/api/v1/tasks/${encodeURIComponent(taskId)}/milestone`, milestone ?? undefined)) !== null,
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
    create: async ({ title, description, color }) => (await command<{ goal: GoalDto }>("create_goal", { title, description: description || null, color: color ?? null })).goal,
    update: async (id, patch) => (await command<{ goal: GoalDto } | null>("update_goal", { id, patch }))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await command<{ id: string } | null>("reorder_goal", { id, anchorId, position })) !== null,
    setHidden: async (hidden) => (await command<{ hidden: boolean }>("set_goals_hidden", { hidden })).hidden,
    links: () => command<GoalLinksDto>("goal_links"),
    link: async (id, kind, targetId, linked) => (await command<unknown>("link_goal", { id, kind, targetId, linked })) !== null,
    suggestions: (taskId) => command<GoalSuggestionsDto | null>("goal_suggestions", { taskId }),
    dismiss: async (taskId, goalId) => (await command<unknown>("dismiss_goal_suggestion", { taskId, goalId })) !== null,
    milestone: async (taskId) => (await command<{ milestone: MilestoneDto | null } | null>("milestone", { taskId }))?.milestone ?? null,
    setMilestone: async (taskId, milestone) => (await command<unknown>("set_milestone", { taskId, milestone })) !== null,
  };
}

/** Same convention as taskKeys: every key starts with ["user", userId]. */
export const goalKeys = {
  all: (userId: string) => ["user", userId, "goals"] as const,
  list: (userId: string) => ["user", userId, "goals", "list"] as const,
  detail: (userId: string, id: string) => ["user", userId, "goals", "detail", id] as const,
  links: (userId: string) => ["user", userId, "goals", "links"] as const,
  // Under "goals", so every link write refreshes them.
  suggestions: (userId: string, taskId: string) => ["user", userId, "goals", "suggestions", taskId] as const,
  // Under "goals" too: unlinking a goal drops the milestone with the link.
  milestone: (userId: string, taskId: string) => ["user", userId, "goals", "milestone", taskId] as const,
};

export function goalQueries(transport: GoalTransport) {
  return {
    list: (userId: string) => queryOptions({ queryKey: goalKeys.list(userId), queryFn: () => transport.goals() }),
    detail: (userId: string, id: string) => queryOptions({ queryKey: goalKeys.detail(userId, id), queryFn: () => transport.goal(id) }),
    links: (userId: string) => queryOptions({ queryKey: goalKeys.links(userId), queryFn: () => transport.links() }),
    suggestions: (userId: string, taskId: string) => queryOptions({ queryKey: goalKeys.suggestions(userId, taskId), queryFn: () => transport.suggestions(taskId) }),
    milestone: (userId: string, taskId: string) => queryOptions({ queryKey: goalKeys.milestone(userId, taskId), queryFn: () => transport.milestone(taskId) }),
  };
}

/** The latest milestone save per task: the next one waits for it. */
const milestoneSaves = new Map<string, Promise<boolean>>();

/** Writes plus the cache entries each one makes stale (every goal read is small). */
export function goalMutations(transport: GoalTransport, cache: QueryClient, userId: string) {
  // Seasons show goal titles and colours too, so goal writes refresh them as well.
  const stale = () => Promise.all([cache.invalidateQueries({ queryKey: goalKeys.all(userId) }), cache.invalidateQueries({ queryKey: ["user", userId, "seasons"] })]);
  return {
    async create(goal: NewGoal) { const created = await transport.create(goal); await stale(); return created; },
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
    /** The hint disappears at once; a failed save brings it back. */
    async dismiss(taskId: string, goalId: string) {
      const key = goalKeys.suggestions(userId, taskId);
      const previous = cache.getQueryData<GoalSuggestionsDto | null>(key);
      if (previous) cache.setQueryData(key, { goalIds: previous.goalIds.filter(id => id !== goalId) });
      try { if (!await transport.dismiss(taskId, goalId)) throw new AccountTransportError("SAVE_FAILED"); }
      catch (error) { if (previous) cache.setQueryData(key, previous); throw error; }
      finally { await stale(); }
    },
    /**
     * Ticket 06: the milestone (mark, criteria, ticks) changes at once; a failed save puts it back.
     * Each PUT replaces the whole list, so one task's saves run in order and the read refreshes
     * only after the last one (an earlier save's refetch would drop a criterion added meanwhile).
     */
    async setMilestone(taskId: string, milestone: MilestoneDto | null) {
      const key = goalKeys.milestone(userId, taskId);
      await cache.cancelQueries({ queryKey: key });
      const previous = cache.getQueryData<MilestoneDto | null>(key);
      cache.setQueryData(key, milestone);
      // The rows' flag follows at once too.
      const linksKey = goalKeys.links(userId);
      const links = cache.getQueryData<GoalLinksDto>(linksKey);
      if (links) cache.setQueryData(linksKey, { ...links, tasks: links.tasks.map(link => link.taskId === taskId ? { ...link, milestone: link.goalId === milestone?.goalId } : link) });
      const save = (milestoneSaves.get(taskId) ?? Promise.resolve()).catch(() => undefined).then(() => transport.setMilestone(taskId, milestone));
      milestoneSaves.set(taskId, save);
      try { if (!await save) throw new AccountTransportError("TASK_NOT_FOUND"); }
      catch (error) { cache.setQueryData(key, previous); if (links) cache.setQueryData(linksKey, links); throw error; }
      finally { if (milestoneSaves.get(taskId) === save) { milestoneSaves.delete(taskId); await stale(); } }
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
  return { ...links, tasks: linked ? [...rest, { goalId, taskId: targetId, milestone: false }] : rest };
}

/** Task IDs that are milestones, from the user's links (every task row's flag). */
export const milestoneTaskIds = (links: GoalLinksDto | undefined): ReadonlySet<string> => new Set(links?.tasks.filter(link => link.milestone).map(link => link.taskId));

/** "2/3": ticked of all done criteria. */
export const criteriaProgress = (criteria: readonly CriterionDto[]) => `${criteria.filter(item => item.done).length}/${criteria.length}`;

/** Moves one criterion up (-1) or down (+1); the ends stay put. */
export function moveCriterion<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

type CriteriaPrompt = () => Promise<boolean>;
let askCriteria: CriteriaPrompt = async () => false;
/** The in-page confirm (CriteriaConfirmHost) registers itself; without one, open criteria stay open. */
export const setCriteriaPrompt = (prompt: CriteriaPrompt) => { askCriteria = prompt; };

/**
 * Ticket 06: every completion path (row circle, `e`, task sheet, bulk) goes
 * through this. A completion the server refuses for open done criteria asks the
 * user once and repeats with the confirm, which ticks them all; Cancel keeps
 * the error, so the optimistic check-off rolls back.
 */
export async function confirmingCriteria<T>(complete: (confirm: boolean) => Promise<T>): Promise<T> {
  try { return await complete(false); }
  catch (error) {
    if (!(error instanceof AccountTransportError && error.code === "CRITERIA_OPEN") || !await askCriteria()) throw error;
    return complete(true);
  }
}
