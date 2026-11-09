import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient, type QueryFilters } from "@tanstack/react-query";
import type { CurrentSeasonDto } from "../../../packages/server/src/season-dto";
import { change, optimisticWrite, type Change } from "./optimistic";
import type { CriterionDto, GoalColor, GoalIcon, GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalMilestoneDto, GoalsDto, GoalSuggestionsDto, MilestoneDto } from "../../../packages/server/src/goal-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import type { ReorderPosition } from "./bulk";

export type { CriterionDto, GoalColor, GoalIcon, GoalDetailDto, GoalDto, GoalLinkKind, GoalLinksDto, GoalMilestoneDto, GoalsDto, GoalSuggestionsDto, MilestoneDto };
export { goalColorKeys, goalColorValue, goalIcons, nextGoalColor } from "../../../packages/server/src/goal-dto";
export interface GoalPatch { title?: string; description?: string; color?: GoalColor; icon?: GoalIcon; archived?: boolean }
/** A new goal; without a colour the server picks the next palette one. */
export interface NewGoal { title: string; description?: string; color?: GoalColor; icon?: GoalIcon }

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
  /** Ticket 25: the same with the Coach's by meaning after them (`coach`); only asked with a provider. */
  coachSuggestions(taskId: string): Promise<GoalSuggestionsDto | null>;
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
    create: async ({ title, description, color, icon }) => required(await request<{ goal: GoalDto }>("POST", "/api/v1/goals", { title, ...(description && { description }), ...(color && { color }), ...(icon && { icon }) }), "SAVE_FAILED").goal,
    update: async (id, patch) => (await request<{ goal: GoalDto }>("PATCH", path(id), patch))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await request("POST", `${path(id)}/reorder`, { anchorId, position })) !== null,
    setHidden: async (hidden) => required(await request<{ hidden: boolean }>("PUT", "/api/v1/goals-visibility", { hidden }), "SAVE_FAILED").hidden,
    links: async () => required(await request<GoalLinksDto>("GET", "/api/v1/goal-links"), "TASKS_UNAVAILABLE"),
    link: async (id, kind, targetId, linked) => (await request(linked ? "PUT" : "DELETE", `${path(id)}/${kind}/${encodeURIComponent(targetId)}`)) !== null,
    suggestions: (taskId) => request<GoalSuggestionsDto>("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}/goal-suggestions`),
    coachSuggestions: (taskId) => request<GoalSuggestionsDto>("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}/goal-suggestions/coach`),
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
    create: async ({ title, description, color, icon }) => (await command<{ goal: GoalDto }>("create_goal", { title, description: description || null, color: color ?? null, icon: icon ?? null })).goal,
    update: async (id, patch) => (await command<{ goal: GoalDto } | null>("update_goal", { id, patch }))?.goal ?? null,
    reorder: async (id, anchorId, position) => (await command<{ id: string } | null>("reorder_goal", { id, anchorId, position })) !== null,
    setHidden: async (hidden) => (await command<{ hidden: boolean }>("set_goals_hidden", { hidden })).hidden,
    links: () => command<GoalLinksDto>("goal_links"),
    link: async (id, kind, targetId, linked) => (await command<unknown>("link_goal", { id, kind, targetId, linked })) !== null,
    suggestions: (taskId) => command<GoalSuggestionsDto | null>("goal_suggestions", { taskId }),
    coachSuggestions: (taskId) => command<GoalSuggestionsDto | null>("coach_goal_suggestions", { taskId }),
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
  coachSuggestions: (userId: string, taskId: string) => ["user", userId, "goals", "suggestions", taskId, "coach"] as const,
  // Under "goals" too: unlinking a goal drops the milestone with the link.
  milestone: (userId: string, taskId: string) => ["user", userId, "goals", "milestone", taskId] as const,
};

export function goalQueries(transport: GoalTransport) {
  return {
    list: (userId: string) => queryOptions({ queryKey: goalKeys.list(userId), queryFn: () => transport.goals() }),
    detail: (userId: string, id: string) => queryOptions({ queryKey: goalKeys.detail(userId, id), queryFn: () => transport.goal(id) }),
    links: (userId: string) => queryOptions({ queryKey: goalKeys.links(userId), queryFn: () => transport.links() }),
    suggestions: (userId: string, taskId: string) => queryOptions({ queryKey: goalKeys.suggestions(userId, taskId), queryFn: () => transport.suggestions(taskId) }),
    // The server caches the Coach's answer per task text, so a refetch rarely calls the model.
    coachSuggestions: (userId: string, taskId: string) => queryOptions({ queryKey: goalKeys.coachSuggestions(userId, taskId), queryFn: () => transport.coachSuggestions(taskId) }),
    milestone: (userId: string, taskId: string) => queryOptions({ queryKey: goalKeys.milestone(userId, taskId), queryFn: () => transport.milestone(taskId) }),
  };
}

/** The latest milestone save per task: the next one waits for it. */
const milestoneSaves = new Map<string, Promise<boolean>>();
let drafts = 0;

/**
 * Goal writes, all optimistic (optimistic.ts): the sidebar, goal page,
 * pickers, milestone and season rows change at once; a failure takes back only
 * that write's change. Goal reads and seasons (they show goal titles and
 * colours) refresh once no write is in flight.
 */
export function goalMutations(transport: GoalTransport, cache: QueryClient, userId: string) {
  const refresh: QueryFilters[] = [{ queryKey: goalKeys.all(userId) }, { queryKey: ["user", userId, "seasons"] }];
  const write = <R,>(changes: Change[], run: () => Promise<R>, reconcile?: (result: R) => Change[]) => optimisticWrite(cache, changes, run, refresh, reconcile);
  const list = goalKeys.list(userId);
  const sidebar = (edit: (goals: GoalDto[]) => GoalDto[]) => change<GoalsDto | undefined>(list, data => data && { ...data, goals: edit(data.goals).filter(goal => !goal.archived) });
  // The sidebar, the goal page and the current season's rows.
  const everywhere = (id: string, edit: (goal: GoalDto) => GoalDto) => [
    sidebar(goals => goals.map(goal => goal.id === id ? edit(goal) : goal)),
    change<GoalDetailDto | null | undefined>(goalKeys.detail(userId, id), data => data && { ...data, goal: edit(data.goal) }),
    change<CurrentSeasonDto | undefined>(["user", userId, "seasons", "current"], data => data?.season ? { ...data, season: { ...data.season, goals: data.season.goals.map(row => {
      if (row.goalId !== id) return row;
      const goal = edit({ id, title: row.title, description: null, color: row.color, icon: row.icon, archived: row.archived });
      return { ...row, title: goal.title, color: goal.color, icon: goal.icon, archived: goal.archived };
    }) } } : data),
  ];
  const ok = (done: boolean, code: "GOAL_NOT_FOUND" | "TASK_NOT_FOUND" = "GOAL_NOT_FOUND") => { if (!done) throw new AccountTransportError(code); return done; };
  return {
    create(goal: NewGoal) {
      const draft: GoalDto = { id: `draft-goal-${++drafts}`, title: goal.title, description: goal.description ?? null, color: goal.color ?? "blue", icon: goal.icon ?? "target", archived: false };
      return write([sidebar(goals => [...goals, draft])], () => transport.create(goal), created => [sidebar(goals => goals.map(item => item.id === draft.id ? created : item))]);
    },
    update(id: string, patch: GoalPatch) {
      return write(everywhere(id, goal => ({ ...goal, ...patch })), async () => { const goal = await transport.update(id, patch); if (!goal) throw new AccountTransportError("GOAL_NOT_FOUND"); return goal; },
        goal => everywhere(id, () => goal));
    },
    /** A refused link (goal or target gone) is an error, so the picker shows it. */
    link(id: string, kind: GoalLinkKind, targetId: string, linked: boolean) {
      return write([change<GoalLinksDto | undefined>(goalKeys.links(userId), data => data && toggleLink(data, id, kind, targetId, linked))],
        async () => { ok(await transport.link(id, kind, targetId, linked)); });
    },
    dismiss(taskId: string, goalId: string) {
      const without = (data: GoalSuggestionsDto | null | undefined) => data && { ...data, goalIds: data.goalIds.filter(id => id !== goalId) };
      return write([change<GoalSuggestionsDto | null | undefined>(goalKeys.suggestions(userId, taskId), without), change<GoalSuggestionsDto | null | undefined>(goalKeys.coachSuggestions(userId, taskId), without)],
        async () => { ok(await transport.dismiss(taskId, goalId)); });
    },
    /**
     * Ticket 06: the milestone (mark, criteria, ticks) and the rows' flag change at once.
     * Each PUT replaces the whole list, so one task's saves run in order; reads refresh only
     * after the last write settles (an earlier save's refetch would drop a criterion added meanwhile).
     */
    setMilestone(taskId: string, milestone: MilestoneDto | null) {
      return write([
        change<MilestoneDto | null | undefined>(goalKeys.milestone(userId, taskId), () => milestone),
        change<GoalLinksDto | undefined>(goalKeys.links(userId), data => data && { ...data, tasks: data.tasks.map(link => link.taskId === taskId ? { ...link, milestone: link.goalId === milestone?.goalId } : link) }),
      ], async () => {
        const save = (milestoneSaves.get(taskId) ?? Promise.resolve()).catch(() => undefined).then(() => transport.setMilestone(taskId, milestone));
        milestoneSaves.set(taskId, save);
        try { ok(await save, "TASK_NOT_FOUND"); }
        finally { if (milestoneSaves.get(taskId) === save) milestoneSaves.delete(taskId); }
      });
    },
    reorder(id: string, anchorId: string, position: ReorderPosition) {
      return write([sidebar(goals => moveGoal(goals, id, anchorId, position))], () => transport.reorder(id, anchorId, position));
    },
    setHidden(hidden: boolean) {
      return write([change<GoalsDto | undefined>(list, data => data && { ...data, hidden })], () => transport.setHidden(hidden));
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
