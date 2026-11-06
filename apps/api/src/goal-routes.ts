import { Elysia } from "elysia";
import { createGoalInput, goalsVisibilityInput, reorderGoalInput, toGoalDto, updateGoalInput, type CreateGoalInput, type GoalDto, type GoalRecord, type GoalsDto, type ReorderGoalInput, type UpdateGoalInput } from "@todalo/server/goal-dto";
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
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

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
      return goal ? { goal: toGoalDto(goal) satisfies GoalDto } : status(404, NOT_FOUND);
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
