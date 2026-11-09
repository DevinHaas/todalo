import { Elysia } from "elysia";
import { bandLabels, seasonStatuses, type StatusInputs } from "@todalo/server/goal-status";
import { CoachModelError, coachErrorDto, coachProviderInfo, keyUnreadable, type CoachConfig, type CoachErrorDto, type CoachModel } from "@todalo/server/coach";
import {
  CHAT_CONTEXT_TURNS, CHAT_HISTORY_LIMIT, chatExtras, chatFacts, chatInput, chatMessages, chatSchema, parseChatReply, toChatMessageDto,
  type ChatGoalNote, type ChatMessageRecord, type CoachChatDto, type NewChatMessage,
} from "@todalo/server/coach-chat";
import {
  acceptsImages, documentKind, documentProblem, kindOf, toCoachDocumentDto,
  type CoachDocumentRecord, type CoachDocumentsDto, type NewCoachDocument,
} from "@todalo/server/coach-documents";
import { extractText } from "@todalo/server/coach-documents-text";
import { AttachmentError, readUploadForm, uploadedFiles } from "@todalo/server/attachment-http";
import { localParts, toDraftDto, weekPlan, type DayContext, type DraftRecord, type NewDraft } from "@todalo/server/drafts";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { withPatterns, type PatternRecord } from "@todalo/server/coach-patterns";
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
  /** Ticket 24: the user's Patterns, sent with every message. */
  patterns?(userId: string): Promise<PatternRecord[]>;
  /** Ticket 29: the session's documents, oldest first; clear() removes them too. */
  documents(userId: string): Promise<CoachDocumentRecord[]>;
  addDocuments(userId: string, documents: NewCoachDocument[]): Promise<void>;
  deleteDocument(userId: string, id: string): Promise<void>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const TOO_LARGE = { code: "FILES_TOO_LARGE", message: "A paste batch must be at most 10 MB." } as const;

/**
 * Goals ticket 22: chat with the Coach about goals and the plan. History is
 * kept per user; a proposed change is saved as a Draft (kind "chat", the next
 * seven days) and nothing else is written. A model failure is a 200 with a
 * message and stores nothing, so the user's text stays in the composer.
 */
export function createCoachChatRoutes(store: CoachChatStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const documents = async (userId: string) => (await store.documents(userId)).map(toCoachDocumentDto);
  const history = async (userId: string): Promise<CoachChatDto> => {
    const [messages, files] = await Promise.all([store.messages(userId, CHAT_HISTORY_LIMIT), documents(userId)]);
    return { messages: messages.map(toChatMessageDto), documents: files };
  };

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
      return { messages: [], documents: [] } satisfies CoachChatDto;
    })
    // Ticket 29: documents for the session, within the task attachment limits; their text is read here, once.
    .post("/coach/documents", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      let files;
      try { files = uploadedFiles(await readUploadForm(request)); }
      catch (error) {
        if (!(error instanceof AttachmentError)) throw error;
        return error.status === 413 ? status(413, TOO_LARGE) : status(400, INVALID);
      }
      const problem = documentProblem(files, (await store.documents(userId)).length);
      if (problem) return status(400, { ...INVALID, message: problem });
      const added = await Promise.all(files.map(async (file): Promise<NewCoachDocument> => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { kind, mediaType } = documentKind(file.name, file.type)!;
        return { name: file.name, mediaType, byteSize: file.size, content: Buffer.from(bytes).toString("base64"), text: await extractText(kind, bytes) };
      }));
      await store.addDocuments(userId, added);
      return status(201, { documents: await documents(userId) } satisfies CoachDocumentsDto);
    }, { parse: "none" })
    .delete("/coach/documents/:id", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      await store.deleteDocument(userId, params.id);
      return { documents: await documents(userId) } satisfies CoachDocumentsDto;
    })
    .post("/coach/chat", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = chatInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const saved = await store.provider(userId);
      if (!saved) return status(404, NO_PROVIDER);
      const failed = async (message: string, error?: CoachErrorDto) => ({ ...await history(userId), draft: null, message, ...error && { error } }) satisfies CoachChatDto;
      if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return failed("Enter your API key again in Settings › Coach.", keyUnreadable(saved.provider));
      const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
      const at = now();
      const today = localParts(at, zone).day;
      const [context, notes, earlier, patterns, files] = await Promise.all([store.dayContext(userId), goalNotes(userId, zone, at), store.messages(userId, CHAT_CONTEXT_TURNS), store.patterns?.(userId) ?? [], store.documents(userId)]);
      // The seven days from today: what the Coach can see and draft.
      const plan = weekPlan({ context, zone, now: at, start: today });
      // Ticket 29: images go only to models that read them; the rest get the extracted text.
      const images = acceptsImages(saved);
      const extras = chatExtras(plan, context, files);
      const attached = images ? files.filter(file => kindOf(file) === "image").map(file => ({ mediaType: file.mediaType, data: file.content })) : [];
      let answer: ReturnType<typeof parseChatReply>;
      try {
        const messages = chatMessages(chatFacts(plan, notes, extras, images), earlier, input.data.message, attached);
        const content = await store.model(saved).complete({ messages: withPatterns(messages, patterns), schema: chatSchema }, request.signal);
        answer = parseChatReply(content, plan, extras);
      } catch (error) {
        if (error instanceof CoachModelError) return failed(error.message, coachErrorDto(error, saved.provider));
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
