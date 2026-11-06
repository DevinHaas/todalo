import { Elysia } from "elysia";
import { createGoalInput, goalLinkKinds, goalsVisibilityInput, reorderGoalInput, toGoalDto, updateGoalInput, type CreateGoalInput, type GoalDetailDto, type GoalDto, type GoalLinkKind, type GoalLinksDto, type GoalRecord, type GoalsDto, type ReorderGoalInput, type UpdateGoalInput } from "@todalo/server/goal-dto";
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
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

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
      const work = await store.work(userId, goal.id);
      return { goal: toGoalDto(goal), projects: work.projects.map(toProjectDto), tasks: work.tasks.map(toTaskDto) } satisfies GoalDetailDto;
    })
    .get("/goal-links", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return await store.links(userId) satisfies GoalLinksDto;
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
