import { Elysia } from "elysia";
import { bandLabels, seasonStatuses, type StatusInputs } from "@todalo/server/goal-status";
import { CoachModelError, coachProviderInfo, type CoachConfig, type CoachModel } from "@todalo/server/coach";
import {
  CHAT_CONTEXT_TURNS, CHAT_HISTORY_LIMIT, chatFacts, chatInput, chatMessages, chatSchema, parseChatReply, toChatMessageDto,
  type ChatGoalNote, type ChatMessageRecord, type CoachChatDto, type NewChatMessage,
} from "@todalo/server/coach-chat";
import { localParts, toDraftDto, weekPlan, type DayContext, type DraftRecord, type NewDraft } from "@todalo/server/drafts";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachChatStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  provider(userId: string): Promise<CoachConfig | null>;
  model(config: CoachConfig): CoachModel;
  /** The tasks, season goals and links the plan facts come from (the drafts' own). */
  dayContext(userId: string): Promise<DayContext>;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  statusInputs(userId: string, season: { startDate: string; lengthDays: number }): Promise<StatusInputs>;
  /** The last `limit` messages, oldest first. */
  messages(userId: string, limit: number): Promise<ChatMessageRecord[]>;
  append(userId: string, messages: NewChatMessage[]): Promise<void>;
  clear(userId: string): Promise<void>;
  /** The drafts' only write (closes the open chat draft of the same day). */
  saveDraft(userId: string, draft: NewDraft): Promise<DraftRecord>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;

/**
 * Goals ticket 22: chat with the Coach about goals and the plan. History is
 * kept per user; a proposed change is saved as a Draft (kind "chat", the next
 * seven days) and nothing else is written. A model failure is a 200 with a
 * message and stores nothing, so the user's text stays in the composer.
 */
export function createCoachChatRoutes(store: CoachChatStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const history = async (userId: string): Promise<CoachChatDto> => ({ messages: (await store.messages(userId, CHAT_HISTORY_LIMIT)).map(toChatMessageDto) });

  /** Each current-season goal's target and status, for the facts. */
  async function goalNotes(userId: string, zone: string, at: Date) {
    const current = await store.season(userId);
    const notes = new Map<string, ChatGoalNote>();
    if (!current) return notes;
    const goals = current.goals.filter(goal => !goal.archivedAt);
    const statuses = seasonStatuses({
      ...current.season, today: localParts(at, zone).day, now: at, zone, goalIds: goals.map(goal => goal.goalId),
      inputs: await store.statusInputs(userId, current.season),
    });
    for (const goal of goals) notes.set(goal.goalId, { target: goal.target, status: bandLabels[statuses[goal.goalId]!.band] });
    return notes;
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/coach/chat", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return history(userId);
    })
    .delete("/coach/chat", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      await store.clear(userId);
      return { messages: [] } satisfies CoachChatDto;
    })
    .post("/coach/chat", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = chatInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const saved = await store.provider(userId);
      if (!saved) return status(404, NO_PROVIDER);
      const failed = async (message: string) => ({ ...await history(userId), draft: null, message }) satisfies CoachChatDto;
      if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return failed("Enter your API key again in Settings › Coach.");
      const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
      const at = now();
      const today = localParts(at, zone).day;
      const [context, notes, earlier] = await Promise.all([store.dayContext(userId), goalNotes(userId, zone, at), store.messages(userId, CHAT_CONTEXT_TURNS)]);
      // The seven days from today: what the Coach can see and draft.
      const plan = weekPlan({ context, zone, now: at, start: today });
      let answer: ReturnType<typeof parseChatReply>;
      try {
        const content = await store.model(saved).complete({ messages: chatMessages(chatFacts(plan, notes), earlier, input.data.message), schema: chatSchema }, request.signal);
        answer = parseChatReply(content, plan);
      } catch (error) {
        if (error instanceof CoachModelError) return failed(error.message);
        if (error instanceof Error && error.name === "AbortError") return failed("The Coach took too long. Try again.");
        throw error;
      }
      const draft = answer.draft && await store.saveDraft(userId, { kind: "chat", period: today, ...answer.draft });
      // The reply a millisecond after the question, so the order survives equal clocks.
      await store.append(userId, [
        { role: "user", content: input.data.message, draftId: null, createdAt: at },
        { role: "assistant", content: answer.reply, draftId: draft?.id ?? null, createdAt: new Date(at.getTime() + 1) },
      ]);
      return { ...await history(userId), draft: draft ? toDraftDto(draft) : null } satisfies CoachChatDto;
    });
}
