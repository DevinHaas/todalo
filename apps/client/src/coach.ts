import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { CoachRecommendationsDto, RecommendationDto } from "../../../packages/server/src/coach-recommendations";
import type { ChatgptCompleteDto, ChatgptDto, ChatgptStartDto, CoachDto, CoachExplanationsDto, CoachModelKind, CoachProviderDto, CoachProviderKind } from "../../../packages/server/src/coach";
import { AccountTransportError, nativeAccountError } from "./errors";
import { coachProviderKinds as serverProviderKinds } from "../../../packages/server/src/coach";
import { localZone } from "./seasons";
import type { DraftDayDto, DraftDto, DraftItemDto, DraftsDto } from "../../../packages/server/src/drafts";
import type { ChatMessageDto, CoachChatDto } from "../../../packages/server/src/coach-chat";
import type { PlanningDto, PlanningInput, PlanningQuestionDto, PlanningSource } from "../../../packages/server/src/coach-planning";
export type { PlanningDto, PlanningInput, PlanningQuestionDto, PlanningSource };
import { taskKeys } from "./tasks";

export type { ChatMessageDto, CoachChatDto };
export type { CoachRecommendationsDto, RecommendationDto };
export type { ChatgptCompleteDto, ChatgptDto, ChatgptStartDto, CoachDto, CoachModelKind, CoachProviderDto, CoachProviderKind, DraftDayDto, DraftDto, DraftItemDto, DraftsDto };
export { draftCounts } from "../../../packages/server/src/drafts";
export { coachProviderInfo, coachProviderKinds, nextCoachProvider, ollamaDefaultUrl, ollamaUrl } from "../../../packages/server/src/coach";
/** What Connect sends; an omitted apiKey keeps the saved key for the same provider. */
export interface CoachProviderInput { provider: CoachProviderKind; model: string; baseUrl?: string; apiKey?: string }
export interface CoachTestResult { ok: boolean; message?: string }
const noDraft: DraftDayDto = { draft: null, message: "Connect an AI provider first in Settings › Coach." };
const noChat: CoachChatDto = { messages: [], draft: null, message: noDraft.message };
const noPlanning: PlanningDto = { question: null, draft: null, message: "Connect an AI provider first in Settings › Coach, or open a goal that is still there." };
const noRecommendation: DraftDayDto = { draft: null, message: "This recommendation is no longer there." };
const notConnected: CoachTestResult = { ok: false, message: "Connect an AI provider first in Settings › Coach." };

/** Goals ticket 17: the Coach's AI provider and its goal status explanations. */
export interface CoachTransport {
  get(): Promise<CoachDto>;
  save(input: CoachProviderInput): Promise<CoachDto>;
  /** Ticket 17c: one provider; every keyed one when omitted. */
  disconnect(provider?: CoachProviderKind): Promise<CoachDto>;
  /** The active provider, or the named one (its card). */
  test(provider?: CoachModelKind): Promise<CoachTestResult>;
  /** Ticket 17c: the provider the Coach uses (a configured one). */
  setActive(provider: CoachModelKind): Promise<CoachDto>;
  explanations(timeZone: string): Promise<CoachExplanationsDto>;
  /** Ticket 18: ChatGPT sign-in. Start returns OpenAI's page (the Mac app opens it and listens on 127.0.0.1 for the return). */
  startChatgpt(): Promise<ChatgptStartDto>;
  /** Mac: waits for the browser to come back to the loopback listener, then completes the sign-in. */
  finishChatgpt(): Promise<ChatgptCompleteDto>;
  /** Web paste mode: the address OpenAI sent the browser to. */
  completeChatgpt(callbackUrl: string): Promise<ChatgptCompleteDto>;
  saveChatgptModel(model: string): Promise<CoachDto>;
  signOutChatgpt(): Promise<CoachDto>;
  /** Opens OpenAI's sign-in page again. */
  openChatgpt(authorizeUrl: string): void;
  /** Ticket 19: open drafts from today on. */
  drafts(timeZone: string): Promise<DraftsDto>;
  /** The Coach drafts today's plan; `draft` null with the reason when it could not. */
  draftDay(timeZone: string): Promise<DraftDayDto>;
  /** Ticket 20: the Coach drafts the week from `start` (its Monday, YYYY-MM-DD); as draftDay. */
  draftWeek(timeZone: string, start: string): Promise<DraftDayDto>;
  /** Ticket 21: the Coach's recommendation per goal off track (none without a provider). */
  recommendations(timeZone: string): Promise<CoachRecommendationsDto>;
  /** Hides it for the rest of the season week. */
  dismissRecommendation(goalId: string): Promise<void>;
  /** Update schedule: a week draft carrying out the goal's recommendation; as draftWeek. */
  draftRecommendation(timeZone: string, goalId: string): Promise<DraftDayDto>;
  /** Accept or decline some items (all when omitted); the draft after, null once decided. TASK_CHANGED when a task changed since. */
  decide(draftId: string, accept: boolean, itemIds?: string[]): Promise<DraftDayDto>;
  /** Ticket 22: the Coach chat, oldest first. */
  chat(): Promise<CoachChatDto>;
  /** The conversation after the reply, with its draft; `message` (nothing stored) when the Coach could not answer. */
  sendChat(timeZone: string, message: string): Promise<CoachChatDto>;
  clearChat(): Promise<CoachChatDto>;
  /** Ticket 23: one planning-session turn: the next question, or the plan draft. */
  planning(timeZone: string, input: PlanningInput): Promise<PlanningDto>;
}

const named = (provider?: string) => provider ? `?${new URLSearchParams({ provider })}` : "";

export function browserCoachTransport(fetcher: typeof fetch = fetch): CoachTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 404 && method === "POST") return null as T;
    if (response.status === 412) throw new AccountTransportError("TASK_CHANGED");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    get: () => request("GET", "/api/v1/coach"),
    save: (input) => request("PUT", "/api/v1/coach/provider", input),
    disconnect: (provider) => request("DELETE", `/api/v1/coach/provider${named(provider)}`),
    test: (provider) => request<CoachTestResult | null>("POST", `/api/v1/coach/provider/test${named(provider)}`).then(result => result ?? notConnected),
    setActive: (provider) => request("PUT", "/api/v1/coach/active", { provider }),
    explanations: (timeZone) => request("GET", `/api/v1/coach/explanations?${new URLSearchParams({ timeZone })}`),
    startChatgpt: () => request("POST", "/api/v1/coach/chatgpt/start"),
    // The web never gets the loopback mode.
    finishChatgpt: async () => ({ status: "failed", message: "Start the sign-in again." }),
    completeChatgpt: (callbackUrl) => request("POST", "/api/v1/coach/chatgpt/complete", { callbackUrl }),
    saveChatgptModel: (model) => request("PUT", "/api/v1/coach/chatgpt", { model }),
    signOutChatgpt: () => request("DELETE", "/api/v1/coach/chatgpt"),
    openChatgpt: (authorizeUrl) => { window.open(authorizeUrl, "_blank", "noopener,noreferrer"); },
    drafts: (timeZone) => request("GET", `/api/v1/coach/drafts?${new URLSearchParams({ timeZone })}`),
    draftDay: (timeZone) => request<DraftDayDto | null>("POST", `/api/v1/coach/drafts/day?${new URLSearchParams({ timeZone })}`).then(result => result ?? noDraft),
    draftWeek: (timeZone, start) => request<DraftDayDto | null>("POST", `/api/v1/coach/drafts/week?${new URLSearchParams({ timeZone, start })}`).then(result => result ?? noDraft),
    recommendations: (timeZone) => request("GET", `/api/v1/coach/recommendations?${new URLSearchParams({ timeZone })}`),
    dismissRecommendation: async (goalId) => { await request("POST", `/api/v1/coach/recommendations/${encodeURIComponent(goalId)}/dismiss`); },
    draftRecommendation: (timeZone, goalId) => request<DraftDayDto | null>("POST", `/api/v1/coach/recommendations/${encodeURIComponent(goalId)}/draft?${new URLSearchParams({ timeZone })}`).then(result => result ?? noRecommendation),
    decide: (draftId, accept, itemIds) => request<DraftDayDto | null>("POST", `/api/v1/coach/drafts/${encodeURIComponent(draftId)}/${accept ? "accept" : "decline"}`, itemIds ? { itemIds } : {})
      .then(result => result ?? { draft: null }),
    chat: () => request("GET", "/api/v1/coach/chat"),
    sendChat: (timeZone, message) => request<CoachChatDto | null>("POST", `/api/v1/coach/chat?${new URLSearchParams({ timeZone })}`, { message }).then(result => result ?? noChat),
    clearChat: () => request("DELETE", "/api/v1/coach/chat"),
    planning: (timeZone, input) => request<PlanningDto | null>("POST", `/api/v1/coach/planning?${new URLSearchParams({ timeZone })}`, input).then(result => result ?? noPlanning),
  };
}

export function coachTransport(): CoachTransport {
  if (!isTauri()) return browserCoachTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // Fixed native commands; Rust attaches the Keychain bearer.
  return {
    get: () => command("coach"),
    save: (provider) => command("save_coach_provider", { provider }),
    disconnect: (provider) => command("disconnect_coach", { provider: provider ?? null }),
    test: async (provider) => (await command<CoachTestResult | null>("test_coach", { provider: provider ?? null })) ?? notConnected,
    setActive: async (provider) => (await command<CoachDto | null>("set_coach_active", { provider })) ?? command("coach"),
    explanations: (timeZone) => command("coach_explanations", { timeZone }),
    startChatgpt: () => command("start_chatgpt_sign_in"),
    finishChatgpt: () => command("finish_chatgpt_sign_in"),
    completeChatgpt: async () => ({ status: "failed", message: "Start the sign-in again." }),
    saveChatgptModel: async (model) => (await command<CoachDto | null>("save_chatgpt_model", { model })) ?? command("coach"),
    signOutChatgpt: () => command("sign_out_chatgpt"),
    openChatgpt: (authorizeUrl) => { void command("open_chatgpt_sign_in", { url: authorizeUrl }).catch(() => undefined); },
    drafts: (timeZone) => command("coach_drafts", { timeZone }),
    draftDay: async (timeZone) => (await command<DraftDayDto | null>("draft_day", { timeZone })) ?? noDraft,
    draftWeek: async (timeZone, start) => (await command<DraftDayDto | null>("draft_week", { timeZone, start })) ?? noDraft,
    recommendations: (timeZone) => command("coach_recommendations", { timeZone }),
    dismissRecommendation: async (goalId) => { await command("dismiss_recommendation", { goalId }); },
    draftRecommendation: async (timeZone, goalId) => (await command<DraftDayDto | null>("draft_recommendation", { timeZone, goalId })) ?? noRecommendation,
    decide: async (draftId, accept, itemIds) => (await command<DraftDayDto | null>("decide_draft", { draftId, accept, itemIds: itemIds ?? null })) ?? { draft: null },
    chat: () => command("coach_chat"),
    sendChat: async (timeZone, message) => (await command<CoachChatDto | null>("send_coach_chat", { timeZone, message })) ?? noChat,
    clearChat: async () => (await command<CoachChatDto | null>("clear_coach_chat")) ?? { messages: [] },
    planning: async (timeZone, { goalId, source, ramble, turns, finish }) => (await command<PlanningDto | null>("coach_planning", { timeZone, goalId, source, ramble, turns, finish: finish ?? false })) ?? noPlanning,
  };
}

/** Ticket 17c: the cards' and the picker's order. */
export const coachCardKinds: readonly CoachModelKind[] = ["chatgpt", ...serverProviderKinds];
const byCard = <T extends { provider: CoachModelKind }>(items: T[]) => items.sort((a, b) => coachCardKinds.indexOf(a.provider) - coachCardKinds.indexOf(b.provider));
/** Ticket 17c: configured providers that can run now, in card order. */
export const usableCoachProviders = (state: CoachDto): CoachModelKind[] => [
  ...state.chatgpt?.status === "signed_in" ? ["chatgpt" as const] : [],
  ...byCard(state.providers.filter(item => item.provider === "ollama" || item.keyHint !== null)).map(item => item.provider),
];
/** Every saved keyed or Ollama provider, in card order. */
export const sortedCoachProviders = (state: CoachDto) => byCard([...state.providers]);

export const coachKeys = {
  all: (userId: string) => ["user", userId, "coach"] as const,
  provider: (userId: string) => ["user", userId, "coach", "provider"] as const,
  /** `stamp` changes with the season's statuses, so a changed status asks again (the server still caches per day). */
  explanations: (userId: string, stamp: string) => ["user", userId, "coach", "explanations", stamp] as const,
  drafts: (userId: string) => ["user", userId, "coach", "drafts"] as const,
  /** Ticket 21: stamped like the explanations. */
  recommendations: (userId: string, stamp: string) => ["user", userId, "coach", "recommendations", stamp] as const,
  chat: (userId: string) => ["user", userId, "coach", "chat"] as const,
};

export function coachQueries(transport: CoachTransport) {
  return {
    provider: (userId: string) => queryOptions({ queryKey: coachKeys.provider(userId), queryFn: () => transport.get() }),
    // A model call per goal at most once a day (the server caches), so a failure is not retried in a loop.
    explanations: (userId: string, stamp: string) => queryOptions({ queryKey: coachKeys.explanations(userId, stamp), queryFn: () => transport.explanations(localZone()), retry: false, staleTime: 5 * 60_000 }),
    drafts: (userId: string) => queryOptions({ queryKey: coachKeys.drafts(userId), queryFn: () => transport.drafts(localZone()) }),
    recommendations: (userId: string, stamp: string) => queryOptions({ queryKey: coachKeys.recommendations(userId, stamp), queryFn: () => transport.recommendations(localZone()), retry: false, staleTime: 5 * 60_000 }),
    chat: (userId: string) => queryOptions({ queryKey: coachKeys.chat(userId), queryFn: () => transport.chat() }),
  };
}

/** Connect and disconnect wait for the server, then refetch the provider and explanations. */
export function coachMutations(transport: CoachTransport, cache: QueryClient, userId: string) {
  const settled = async <T,>(run: () => Promise<T>) => { try { return await run(); } finally { await cache.invalidateQueries({ queryKey: coachKeys.all(userId) }); } };
  return {
    save: (input: CoachProviderInput) => settled(() => transport.save(input)),
    disconnect: (provider?: CoachProviderKind) => settled(() => transport.disconnect(provider)),
    test: (provider?: CoachModelKind) => transport.test(provider),
    setActive: (provider: CoachModelKind) => settled(() => transport.setActive(provider)),
    saveChatgptModel: (model: string) => settled(() => transport.saveChatgptModel(model)),
    signOutChatgpt: () => settled(() => transport.signOutChatgpt()),
    /** Once signed in, the provider and explanations refetch. */
    finishChatgpt: () => settled(() => transport.finishChatgpt()),
    completeChatgpt: (callbackUrl: string) => settled(() => transport.completeChatgpt(callbackUrl)),
  };
}

/**
 * Ticket 19: drafting and deciding. A decision refetches the tasks (accepted
 * items changed them) and the drafts, also after a refusal (TASK_CHANGED).
 */
export function draftMutations(transport: CoachTransport, cache: QueryClient, userId: string) {
  const replace = (draft: DraftDto | null, id?: string) => cache.setQueryData<DraftsDto>(coachKeys.drafts(userId), current => {
    // A new draft replaces the open one of its kind and period (as the server does); a day and a week draft stay side by side.
    const others = (current?.drafts ?? []).filter(item => item.id !== (id ?? draft?.id) && !(item.kind === draft?.kind && item.period === draft.period));
    return { drafts: draft ? [...others, draft] : others };
  });
  return {
    draftDay: async () => {
      const result = await transport.draftDay(localZone());
      if (result.draft) replace(result.draft);
      return result;
    },
    draftWeek: async (start: string) => {
      const result = await transport.draftWeek(localZone(), start);
      if (result.draft) replace(result.draft);
      return result;
    },
    /** Ticket 21: Update schedule on a recommendation. */
    draftRecommendation: async (goalId: string) => {
      const result = await transport.draftRecommendation(localZone(), goalId);
      if (result.draft) replace(result.draft);
      return result;
    },
    decide: async ({ draftId, accept, itemIds }: { draftId: string; accept: boolean; itemIds?: string[] }) => {
      try {
        const result = await transport.decide(draftId, accept, itemIds);
        replace(result.draft, draftId);
        return result;
      } finally {
        await Promise.all([cache.invalidateQueries({ queryKey: coachKeys.drafts(userId) }), accept && cache.invalidateQueries({ queryKey: taskKeys.today(userId) })]);
      }
    },
  };
}
