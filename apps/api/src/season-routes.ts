import { Elysia } from "elysia";
import { seasonProgress, todayIn } from "@todalo/server/season-days";
import {
  addSeasonGoalInput, startSeasonInput, toSeasonDto, toSeasonGoalDto, updateSeasonGoalInput,
  type AddSeasonGoalInput, type CurrentSeasonDto, type SeasonGoalRecord, type SeasonRecord, type StartSeasonInput, type UpdateSeasonGoalInput,
} from "@todalo/server/season-dto";
import { writeUser } from "./project-routes";

export interface SeasonStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** The one current (unended) season with its goals; null before the first. */
  current(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  /** null while another season is current. */
  start(userId: string, input: StartSeasonInput): Promise<SeasonRecord | null>;
  /** null when the season is missing, foreign or ended, or the goal missing, foreign or archived; "exists" when already added. */
  addGoal(userId: string, seasonId: string, input: AddSeasonGoalInput): Promise<SeasonGoalRecord | "exists" | null>;
  /** null when the season is missing, foreign or ended, or the goal is not in it. */
  updateGoal(userId: string, seasonId: string, goalId: string, patch: UpdateSeasonGoalInput): Promise<SeasonGoalRecord | null>;
  /** The clock for the day count (tests pin it). */
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This season or goal does not exist or you do not have access to it." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const SEASON_EXISTS = { code: "SEASON_EXISTS", message: "A season is already running. End it before starting another." } as const;
const GOAL_IN_SEASON = { code: "GOAL_IN_SEASON", message: "This goal is already in the season." } as const;

const zoneOrUtc = (zone: string | null) => {
  if (!zone) return "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return zone; } catch { return "UTC"; }
};

// Same envelope and ownership rules as goal-routes.ts; the day count is in the
// timezone the client sends (?timeZone=), like the import preview.
export function createSeasonRoutes(store: SeasonStore) {
  const writer = (request: Request) => writeUser(store, request);
  const now = store.now ?? (() => new Date());

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/seasons/current", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const current = await store.current(userId);
      if (!current) return { season: null } satisfies CurrentSeasonDto;
      const today = todayIn(zoneOrUtc(new URL(request.url).searchParams.get("timeZone")), now());
      const { season, goals } = current;
      return { season: { ...toSeasonDto(season, goals), progress: seasonProgress(season.startDate, season.lengthDays, today) } } satisfies CurrentSeasonDto;
    })
    .post("/seasons", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = startSeasonInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const season = await store.start(userId, input.data);
      return season ? status(201, { season: toSeasonDto(season, []) }) : status(409, SEASON_EXISTS);
    })
    .post("/seasons/:id/goals", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = addSeasonGoalInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const row = await store.addGoal(userId, params.id, input.data);
      if (row === "exists") return status(409, GOAL_IN_SEASON);
      return row ? status(201, { goal: toSeasonGoalDto(row) }) : status(404, NOT_FOUND);
    })
    // Tier changes and moved targets; the target text is replaced, not versioned.
    .patch("/seasons/:id/goals/:goalId", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = updateSeasonGoalInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const row = await store.updateGoal(userId, params.id, params.goalId, input.data);
      return row ? { goal: toSeasonGoalDto(row) } : status(404, NOT_FOUND);
    });
}
