import { Elysia } from "elysia";
import { CoachModelError, coachErrorDto, coachProviderInfo, keyUnreadable, type CoachConfig, type CoachErrorDto, type CoachModel } from "@todalo/server/coach";
import {
  PLANNING_DRAFT_PROMPT, PLANNING_QUESTION_LIMIT, PLANNING_QUESTION_PROMPT, milestoneLastDay, parsePlanningDraft, parsePlanningQuestion, planningDraftSchema,
  planningFacts, planningInput, planningMessages, planningQuestionSchema, type PlanningDto,
} from "@todalo/server/coach-planning";
import { localParts, toDraftDto, weekPlan, type DayContext, type DraftRecord, type NewDraft } from "@todalo/server/drafts";
import { withPatterns, type PatternRecord } from "@todalo/server/coach-patterns";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachPlanningStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  provider(userId: string): Promise<CoachConfig | null>;
  model(config: CoachConfig): CoachModel;
  /** The tasks, season goals and links (the drafts' own). */
  dayContext(userId: string): Promise<DayContext>;
  /** The user's goal (archived too), or null. */
  goal(userId: string, goalId: string): Promise<{ id: string; title: string; description: string | null; archivedAt: Date | null } | null>;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  /** The goal's milestone task IDs. */
  milestones(userId: string, goalId: string): Promise<{ taskId: string }[]>;
  /** The drafts' only write (closes the open plan draft of the same day). */
  saveDraft(userId: string, draft: NewDraft): Promise<DraftRecord>;
  /** Ticket 24: the user's stored patterns, for every Coach prompt. */
  patterns?(userId: string): Promise<PatternRecord[]>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const NO_GOAL = { code: "GOAL_NOT_FOUND", message: "This goal is no longer there." } as const;

/**
 * Goals ticket 23: one planning-session turn. The client sends the transcript
 * (what the user said, each question and answer); the Coach returns the next
 * multiple-choice question, or (when it knows enough, the questions run out or
 * the user finishes) a Draft of new tasks with times and milestones. Nothing
 * but the draft is written; a model failure is a 200 with a message.
 */
export function createCoachPlanningRoutes(store: CoachPlanningStore) {
  const now = store.now ?? (() => new Date());
  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .post("/coach/planning", async ({ request, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = planningInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const saved = await store.provider(userId);
      if (!saved) return status(404, NO_PROVIDER);
      const { goalId, source, turns } = input.data;
      const goal = await store.goal(userId, goalId);
      if (!goal || goal.archivedAt) return status(404, NO_GOAL);
      const failed = (message: string, error?: CoachErrorDto) => ({ question: null, draft: null, message, ...error && { error } }) satisfies PlanningDto;
      if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return failed("Enter your API key again in Settings › Coach.", keyUnreadable(saved.provider));
      const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
      const at = now();
      const today = localParts(at, zone).day;
      const [context, current, marked, patterns] = await Promise.all([store.dayContext(userId), store.season(userId), store.milestones(userId, goalId), store.patterns?.(userId) ?? []]);
      const plan = weekPlan({ context, zone, now: at, start: today });
      const milestoneIds = new Set(marked.map(row => row.taskId));
      const projectIds = new Set(context.links.projects.filter(link => link.goalId === goalId).map(link => link.projectId));
      const taskIds = new Set(context.links.tasks.filter(link => link.goalId === goalId).map(link => link.taskId));
      const inSeason = current?.goals.find(row => row.goalId === goalId && !row.archivedAt);
      const lastDay = milestoneLastDay(today, current && !current.season.endedAt ? current.season : null);
      const facts = planningFacts(plan, {
        goalId, title: goal.title, description: goal.description,
        season: inSeason ? { tier: inSeason.tier, target: inSeason.target } : null,
        openTasks: context.tasks.filter(task => task.status !== "done" && !milestoneIds.has(task.id) && (taskIds.has(task.id) || (task.projectId !== null && projectIds.has(task.projectId)))).map(task => task.title),
        milestones: context.tasks.filter(task => milestoneIds.has(task.id)).map(task => ({ title: task.title, due: task.dueDate ? localParts(task.dueDate, zone).day : null })),
      }, source, lastDay);
      const model = store.model(saved);
      try {
        if (!input.data.finish && turns.length < PLANNING_QUESTION_LIMIT) {
          const next = parsePlanningQuestion(await model.complete({ messages: withPatterns(planningMessages(PLANNING_QUESTION_PROMPT, facts, input.data), patterns), schema: planningQuestionSchema }, request.signal));
          if (next !== "done") return { question: { ...next, step: turns.length + 1, total: PLANNING_QUESTION_LIMIT }, draft: null } satisfies PlanningDto;
        }
        const drafted = parsePlanningDraft(await model.complete({ messages: withPatterns(planningMessages(PLANNING_DRAFT_PROMPT, facts, input.data), patterns), schema: planningDraftSchema }, request.signal), plan, goalId, lastDay);
        if (!drafted.items.length && !drafted.overflow) return failed(drafted.summary || "The Coach found nothing to add. Say a little more and try again.");
        return { question: null, draft: toDraftDto(await store.saveDraft(userId, { kind: "plan", period: today, ...drafted })) } satisfies PlanningDto;
      } catch (error) {
        if (error instanceof CoachModelError) return failed(error.message, coachErrorDto(error, saved.provider));
        if (error instanceof Error && error.name === "AbortError") return failed("The Coach took too long. Try again.");
        throw error;
      }
    });
}
