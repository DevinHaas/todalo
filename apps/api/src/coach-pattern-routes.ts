import { Elysia } from "elysia";
import { CoachModelError, coachErrorDto, coachProviderInfo, keyUnreadable, type CoachConfig, type CoachErrorDto, type CoachModel } from "@todalo/server/coach";
import {
  PATTERN_LIMIT, learnFacts, learnMessages, learnSchema, parseLearned, patternInput, patternSource, toPatternDto,
  type CoachPatternsDto, type NewPattern, type PatternRecord,
} from "@todalo/server/coach-patterns";
import type { TaskMove } from "@todalo/server/coach-recommendations";
import { seasonSignals, type StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { todayIn } from "@todalo/server/season-days";
import { zonedTaskDate } from "@todalo/server/dates";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachPatternStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  provider(userId: string): Promise<CoachConfig | null>;
  model(config: CoachConfig): CoachModel;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  statusInputs(userId: string, season: { startDate: string; lengthDays: number }): Promise<StatusInputs>;
  moves(userId: string, since: Date): Promise<TaskMove[]>;
  patterns(userId: string): Promise<PatternRecord[]>;
  add(userId: string, patterns: NewPattern[], at: Date): Promise<void>;
  /** False when the user has no such pattern. */
  update(userId: string, id: string, statement: string, at: Date): Promise<boolean>;
  remove(userId: string, id: string): Promise<boolean>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This pattern is no longer there." } as const;

/**
 * Goals ticket 24: the Patterns the Coach learned. Listing, editing and
 * deleting work without a provider (they are the user's data); learning is
 * one model call over this season's goal work and ratings, and writes only
 * patterns. A model failure is a 200 with a message and adds nothing.
 */
export function createCoachPatternRoutes(store: CoachPatternStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const list = async (userId: string): Promise<CoachPatternsDto> => ({ patterns: (await store.patterns(userId)).map(toPatternDto) });

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/coach/patterns", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return list(userId);
    })
    .post("/coach/patterns/learn", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const saved = await store.provider(userId);
      if (!saved) return status(404, NO_PROVIDER);
      const nothing = async (message: string, error?: CoachErrorDto) => ({ ...await list(userId), learned: 0, message, ...error && { error } }) satisfies CoachPatternsDto;
      if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return nothing("Enter your API key again in Settings › Coach.", keyUnreadable(saved.provider));
      const known = await store.patterns(userId);
      if (known.length >= PATTERN_LIMIT) return nothing(`You keep ${PATTERN_LIMIT} patterns, the most the Coach learns. Delete some to learn more.`);
      const current = await store.season(userId);
      if (!current) return nothing("Start a season first: the Coach learns from your goal work in it.");
      const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
      const at = now(), today = todayIn(zone, at);
      const { season } = current;
      const goals = current.goals.filter(goal => !goal.archivedAt);
      const [inputs, moves] = await Promise.all([store.statusInputs(userId, season), store.moves(userId, zonedTaskDate(season.startDate, "00:00", zone)!)]);
      const { perGoal } = seasonSignals({ ...season, today, now: at, zone, goalIds: goals.map(goal => goal.goalId), inputs });
      const facts = learnFacts({ startDate: season.startDate, today, zone, now: at, goals, weeks: perGoal, inputs, moves, known: known.map(row => row.statement) });
      if (!facts) return nothing("Not enough to learn from yet: complete, schedule or rate some goal work first.");
      let fresh: ReturnType<typeof parseLearned>;
      try {
        fresh = parseLearned(await store.model(saved).complete({ messages: learnMessages(facts), schema: learnSchema }, request.signal), facts.known, PATTERN_LIMIT - known.length);
      } catch (error) {
        if (error instanceof CoachModelError) return nothing(error.message, coachErrorDto(error, saved.provider));
        if (error instanceof Error && error.name === "AbortError") return nothing("The Coach took too long. Try again.");
        throw error;
      }
      if (!fresh.length) return nothing("The Coach found nothing new it is sure about.");
      const source = patternSource(season.startDate, today);
      await store.add(userId, fresh.map(pattern => ({ ...pattern, source })), at);
      return { ...await list(userId), learned: fresh.length } satisfies CoachPatternsDto;
    })
    .patch("/coach/patterns/:id", async ({ request, params, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = patternInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      if (!await store.update(userId, params.id, input.data.statement, now())) return status(404, NOT_FOUND);
      return list(userId);
    })
    .delete("/coach/patterns/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (!await store.remove(userId, params.id)) return status(404, NOT_FOUND);
      return list(userId);
    });
}
