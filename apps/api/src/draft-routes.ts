import { Elysia } from "elysia";
import { CoachModelError, coachProviderInfo, type CoachConfig, type CoachModel } from "@todalo/server/coach";
import {
  dayDraftMessages, dayDraftSchema, dayPlan, draftCurrent, draftDecisionInput, localParts, parseDayDraft, parseWeekDraft, planAccept, planDecline, toDraftDto,
  weekDraftMessages, weekDraftSchema, weekDraftStart, weekPlan,
  type AcceptedWrite, type DayContext, type DraftDayDto, type DraftKind, type DraftRecord, type DraftsDto, type DraftTask, type NewDraft,
} from "@todalo/server/drafts";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface DraftStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  provider(userId: string): Promise<CoachConfig | null>;
  model(config: CoachConfig): CoachModel;
  /** The tasks, season goals and links a day or week draft plans from. */
  dayContext(userId: string): Promise<DayContext>;
  /** Open drafts with every item; with `draftId` just that one (if open and the user's). */
  drafts(userId: string, draftId?: string): Promise<DraftRecord[]>;
  /** The Coach's only write: closes the open draft of the same kind and period. */
  save(userId: string, draft: NewDraft): Promise<DraftRecord>;
  tasks(userId: string, ids: string[]): Promise<DraftTask[]>;
  /** Applies accepted items and records decisions atomically, then pushes the calendar. */
  resolve(userId: string, draft: DraftRecord, decision: { accepted: AcceptedWrite[]; declined: string[] }): Promise<void>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const NOT_FOUND = { code: "DRAFT_NOT_FOUND", message: "This draft is no longer open." } as const;
const CHANGED = { code: "TASK_CHANGED", message: "A task in this draft changed since the Coach drafted it. Draft again." } as const;

/**
 * Goals ticket 19: the Coach drafts today's plan (after or during the
 * Check-in); the user accepts or declines all of it or single items. Drafting
 * writes only the draft; tasks and the calendar change on accept alone.
 * Ticket 20: the same for a week (`start`: its first day), from the Weekly review.
 */
export function createDraftRoutes(store: DraftStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const zoneOf = (request: Request) => zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));

  async function decide(request: Request, id: string, body: unknown, accept: boolean, status: (code: number, body: unknown) => unknown) {
    const userId = await writer(request);
    if (userId === "forbidden") return status(403, FORBIDDEN);
    if (!userId) return status(401, UNAUTHENTICATED);
    const input = draftDecisionInput.safeParse(body ?? {});
    if (!input.success) return status(400, INVALID);
    const [draft] = await store.drafts(userId, id);
    if (!draft) return status(404, NOT_FOUND);
    const { itemIds } = input.data;
    let decision: { accepted: AcceptedWrite[]; declined: string[] };
    if (accept) {
      const ids = draft.items.flatMap(item => item.taskId && item.state === "pending" ? [item.taskId] : []);
      const accepted = planAccept(draft, itemIds, await store.tasks(userId, ids));
      if (accepted === "missing") return status(404, NOT_FOUND);
      if (accepted === "changed") return status(412, CHANGED);
      decision = { accepted, declined: [] };
    } else {
      const declined = planDecline(draft, itemIds);
      if (declined === "missing") return status(404, NOT_FOUND);
      decision = { accepted: [], declined };
    }
    await store.resolve(userId, draft, decision);
    const [after] = await store.drafts(userId, id);
    return { draft: after ? toDraftDto(after) : null } satisfies DraftDayDto;
  }

  // A model failure or an invalid draft is a 200 { draft: null, message } so the
  // reason reaches the native client too (as Test connection does).
  async function propose(request: Request, status: (code: number, body: unknown) => unknown, kind: DraftKind) {
    const userId = await writer(request);
    if (userId === "forbidden") return status(403, FORBIDDEN);
    if (!userId) return status(401, UNAUTHENTICATED);
    const zone = zoneOf(request);
    const at = now();
    const start = kind === "week" ? weekDraftStart(new URL(request.url).searchParams.get("start"), localParts(at, zone).day) : null;
    if (kind === "week" && !start) return status(400, INVALID);
    const saved = await store.provider(userId);
    if (!saved) return status(404, NO_PROVIDER);
    if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return { draft: null, message: "Enter your API key again in Settings › Coach." } satisfies DraftDayDto;
    const context = await store.dayContext(userId);
    const ask = (() => {
      if (start === null) {
        const plan = dayPlan({ context, zone, now: at });
        return { period: plan.day, messages: dayDraftMessages(plan), schema: dayDraftSchema, parse: (content: string) => parseDayDraft(content, plan), works: "Your day already works" };
      }
      const plan = weekPlan({ context, zone, now: at, start });
      return { period: start, messages: weekDraftMessages(plan), schema: weekDraftSchema, parse: (content: string) => parseWeekDraft(content, plan), works: "Your week already works" };
    })();
    let drafted: Omit<NewDraft, "kind" | "period">;
    try { drafted = ask.parse(await store.model(saved).complete({ messages: ask.messages, schema: ask.schema }, request.signal)); }
    catch (error) {
      if (error instanceof CoachModelError) return { draft: null, message: error.message } satisfies DraftDayDto;
      if (error instanceof Error && error.name === "AbortError") return { draft: null, message: "The Coach took too long. Try again." } satisfies DraftDayDto;
      throw error;
    }
    if (!drafted.items.length) return { draft: null, message: drafted.summary || `${ask.works}: the Coach has nothing to change.` } satisfies DraftDayDto;
    return { draft: toDraftDto(await store.save(userId, { kind, period: ask.period, ...drafted })) } satisfies DraftDayDto;
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    // Open drafts from today on (a past day's draft, or a past week's, is left behind).
    .get("/coach/drafts", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const today = localParts(now(), zoneOf(request)).day;
      return { drafts: (await store.drafts(userId)).filter(draft => draftCurrent(draft, today)).map(toDraftDto) } satisfies DraftsDto;
    })
    .post("/coach/drafts/day", ({ request, status }) => propose(request, status, "day"))
    .post("/coach/drafts/week", ({ request, status }) => propose(request, status, "week"))
    .post("/coach/drafts/:id/accept", ({ request, params, body, status }) => decide(request, params.id, body, true, status))
    .post("/coach/drafts/:id/decline", ({ request, params, body, status }) => decide(request, params.id, body, false, status));
}
