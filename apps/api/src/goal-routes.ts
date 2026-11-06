import { Elysia } from "elysia";
import { createGoalInput, goalLinkKinds, milestoneInput, milestoneReached, type CriterionDto, type GoalMilestoneDto, type MilestoneDto, type MilestoneInput, goalsVisibilityInput, reorderGoalInput, toGoalDto, updateGoalInput, type CreateGoalInput, type GoalDetailDto, type GoalDto, type GoalLinkKind, type GoalLinksDto, type GoalRecord, type GoalsDto, type GoalSuggestionsDto, type ReorderGoalInput, type UpdateGoalInput } from "@todalo/server/goal-dto";
import { suggestGoals, type SuggestionTask } from "@todalo/server/goal-suggestions";
import { toProjectDto, type ProjectRecord } from "@todalo/server/project-dto";
import { toTaskDto, type TaskRecord } from "@todalo/server/task-dto";
import { writeUser } from "./project-routes";

export interface GoalStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session (CSRF). */
  allowedOrigins: ReadonlySet<string>;
  /** Active goals in the user's order. */
  list(userId: string): Promise<GoalRecord[]>;
  /** Archived goals included; null when missing or another user's. */
  get(userId: string, id: string): Promise<GoalRecord | null>;
  create(userId: string, input: CreateGoalInput): Promise<GoalRecord>;
  update(userId: string, id: string, patch: UpdateGoalInput): Promise<GoalRecord | null>;
  /** false when either goal is missing, foreign or archived. */
  reorder(userId: string, id: string, move: ReorderGoalInput): Promise<boolean>;
  hidden(userId: string): Promise<boolean>;
  setHidden(userId: string, hidden: boolean): Promise<boolean>;
  /** The owner's projects and tasks linked to an owned goal. */
  work(userId: string, goalId: string): Promise<{ projects: ProjectRecord[]; tasks: TaskRecord[] }>;
  links(userId: string): Promise<GoalLinksDto>;
  /** Idempotent; false when the goal or the project/task is missing or foreign. */
  link(userId: string, goalId: string, kind: GoalLinkKind, targetId: string): Promise<boolean>;
  /** Removes only the link; false when the goal is missing or foreign. */
  unlink(userId: string, goalId: string, kind: GoalLinkKind, targetId: string): Promise<boolean>;
  /** The owner's tasks with their project and labels (ticket 03 suggestions). */
  tasks(userId: string): Promise<SuggestionTask[]>;
  dismissed(userId: string, taskId: string): Promise<string[]>;
  /** Idempotent; false when the goal or task is missing or foreign. */
  dismiss(userId: string, taskId: string, goalId: string): Promise<boolean>;
  /** Ticket 06. false: the task is missing or foreign; null: not a milestone. */
  milestone(userId: string, taskId: string): Promise<MilestoneDto | null | false>;
  /** Marks the task a milestone for one linked goal (moving the mark) and replaces its criteria. */
  setMilestone(userId: string, taskId: string, input: MilestoneInput): Promise<MilestoneDto | "missing" | "unlinked">;
  /** Unmarks; the link stays. false when the task is missing or foreign. */
  clearMilestone(userId: string, taskId: string): Promise<boolean>;
  /** An owned goal's milestones: task IDs with their criteria. */
  milestones(userId: string, goalId: string): Promise<{ taskId: string; criteria: CriterionDto[] }[]>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This goal does not exist or you do not have access to it." } as const;
const TASK_NOT_FOUND = { code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NOT_LINKED = { code: "GOAL_NOT_LINKED", message: "Link this goal to the task before making it a milestone." } as const;

const linkKind = (value: string) => goalLinkKinds.find(kind => kind === value) ?? null;

// Same envelope and ownership rules as project-routes.ts: missing and foreign
// IDs share one 404 so IDs cannot be probed.
export function createGoalRoutes(store: GoalStore) {
  const writer = (request: Request) => writeUser(store, request);

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/goals", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const [goals, hidden] = await Promise.all([store.list(userId), store.hidden(userId)]);
      return { goals: goals.map(toGoalDto), hidden } satisfies GoalsDto;
    })
    .get("/goals/:id", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const goal = await store.get(userId, params.id);
      if (!goal) return status(404, NOT_FOUND);
      const [work, marked] = await Promise.all([store.work(userId, goal.id), store.milestones(userId, goal.id)]);
      const byId = new Map(work.tasks.map(task => [task.id, task]));
      // The path to the goal: by due date, undated last, otherwise in the linked tasks' order.
      const due = (task: TaskRecord) => task.dueDate == null ? Infinity : new Date(task.dueDate).getTime();
      const milestones = marked.flatMap(({ taskId, criteria }) => { const task = byId.get(taskId); return task ? [{ task, criteria }] : []; })
        .sort((a, b) => due(a.task) - due(b.task) || work.tasks.indexOf(a.task) - work.tasks.indexOf(b.task))
        .map(({ task, criteria }): GoalMilestoneDto => ({ task: toTaskDto(task), criteria, reached: milestoneReached(criteria, task.status === "done") }));
      return { goal: toGoalDto(goal), projects: work.projects.map(toProjectDto), tasks: work.tasks.map(toTaskDto), milestones } satisfies GoalDetailDto;
    })
    // Ticket 06: one milestone per task, for one of its linked goals. PUT marks it and
    // replaces the ordered criteria (add, edit, reorder and tick all go through it).
    .get("/tasks/:id/milestone", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const milestone = await store.milestone(userId, params.id);
      return milestone === false ? status(404, TASK_NOT_FOUND) : { milestone };
    })
    .put("/tasks/:id/milestone", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = milestoneInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const milestone = await store.setMilestone(userId, params.id, input.data);
      if (milestone === "missing") return status(404, TASK_NOT_FOUND);
      if (milestone === "unlinked") return status(409, NOT_LINKED);
      return { milestone };
    })
    .delete("/tasks/:id/milestone", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.clearMilestone(userId, params.id) ? { milestone: null } : status(404, TASK_NOT_FOUND);
    })
    .get("/goal-links", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.links(userId) satisfies GoalLinksDto;
    })
    // Suggestions are read-only hints: accepting is the link PUT below, so nothing links without a click.
    .get("/tasks/:id/goal-suggestions", async ({ request, params, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const [tasks, goals, links, dismissed, hidden] = await Promise.all([store.tasks(userId), store.list(userId), store.links(userId), store.dismissed(userId, params.id), store.hidden(userId)]);
      const task = tasks.find(item => item.id === params.id);
      if (!task) return status(404, TASK_NOT_FOUND);
      // Hidden Goals show no hints.
      return { goalIds: hidden ? [] : suggestGoals({ task, tasks, taskLinks: links.tasks, projectLinks: links.projects, goalIds: goals.map(goal => goal.id), dismissed }) } satisfies GoalSuggestionsDto;
    })
    .delete("/tasks/:id/goal-suggestions/:goalId", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.dismiss(userId, params.id, params.goalId) ? { taskId: params.id, goalId: params.goalId } : status(404, NOT_FOUND);
    })
    // Linking is explicit and per pair: PUT links (idempotent), DELETE removes only the link.
    .put("/goals/:id/:kind/:targetId", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const kind = linkKind(params.kind);
      return kind && await store.link(userId, params.id, kind, params.targetId) ? { goalId: params.id, kind, targetId: params.targetId } : status(404, NOT_FOUND);
    })
    .delete("/goals/:id/:kind/:targetId", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const kind = linkKind(params.kind);
      return kind && await store.unlink(userId, params.id, kind, params.targetId) ? { goalId: params.id, kind, targetId: params.targetId } : status(404, NOT_FOUND);
    })
    .post("/goals", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = createGoalInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return status(201, { goal: toGoalDto(await store.create(userId, input.data)) satisfies GoalDto });
    })
    .patch("/goals/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = updateGoalInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const goal = await store.update(userId, params.id, input.data);
      return goal ? { goal: toGoalDto(goal) satisfies GoalDto } : status(404, NOT_FOUND);
    })
    .post("/goals/:id/reorder", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = reorderGoalInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return await store.reorder(userId, params.id, input.data) ? { id: params.id } : status(404, NOT_FOUND);
    })
    // Hiding Goals only changes the sidebar; goals, projects and tasks are untouched.
    .put("/goals-visibility", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = goalsVisibilityInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return { hidden: await store.setHidden(userId, input.data.hidden) };
    });
}
