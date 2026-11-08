import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ChatgptDto, ChatgptPollDto, ChatgptSignInDto, CoachDto, CoachExplanationsDto, CoachProviderDto, CoachProviderKind } from "../../../packages/server/src/coach";
import { AccountTransportError, nativeAccountError } from "./errors";
import { localZone } from "./seasons";
import type { DraftDayDto, DraftDto, DraftItemDto, DraftsDto } from "../../../packages/server/src/drafts";
import { taskKeys } from "./tasks";

export type { ChatgptDto, ChatgptPollDto, ChatgptSignInDto, CoachDto, CoachProviderDto, CoachProviderKind, DraftDayDto, DraftDto, DraftItemDto, DraftsDto };
export { draftCounts } from "../../../packages/server/src/drafts";
export { coachProviderInfo, coachProviderKinds, ollamaDefaultUrl, ollamaUrl } from "../../../packages/server/src/coach";
const chatgptPage = "https://auth.openai.com/codex/device";
/** What Connect sends; an omitted apiKey keeps the saved key for the same provider. */
export interface CoachProviderInput { provider: CoachProviderKind; model: string; baseUrl?: string; apiKey?: string }
export interface CoachTestResult { ok: boolean; message?: string }
const noDraft: DraftDayDto = { draft: null, message: "Connect an AI provider first in Settings › Coach." };
const notConnected: CoachTestResult = { ok: false, message: "Connect an AI provider first in Settings › Coach." };

/** Goals ticket 17: the Coach's AI provider and its goal status explanations. */
export interface CoachTransport {
  get(): Promise<CoachDto>;
  save(input: CoachProviderInput): Promise<CoachDto>;
  disconnect(): Promise<CoachDto>;
  test(): Promise<CoachTestResult>;
  explanations(timeZone: string): Promise<CoachExplanationsDto>;
  /** Ticket 18: ChatGPT sign-in. Start returns the code to enter at OpenAI; poll until signed in. */
  startChatgpt(): Promise<ChatgptSignInDto>;
  pollChatgpt(): Promise<ChatgptPollDto>;
  saveChatgptModel(model: string): Promise<CoachDto>;
  signOutChatgpt(): Promise<CoachDto>;
  /** Opens OpenAI's sign-in page; call it straight from the click (pop-up blockers). */
  openChatgpt(): void;
  /** Ticket 19: open drafts from today on. */
  drafts(timeZone: string): Promise<DraftsDto>;
  /** The Coach drafts today's plan; `draft` null with the reason when it could not. */
  draftDay(timeZone: string): Promise<DraftDayDto>;
  /** Accept or decline some items (all when omitted); the draft after, null once decided. TASK_CHANGED when a task changed since. */
  decide(draftId: string, accept: boolean, itemIds?: string[]): Promise<DraftDayDto>;
}

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
    disconnect: () => request("DELETE", "/api/v1/coach/provider"),
    test: () => request<CoachTestResult | null>("POST", "/api/v1/coach/provider/test").then(result => result ?? notConnected),
    explanations: (timeZone) => request("GET", `/api/v1/coach/explanations?${new URLSearchParams({ timeZone })}`),
    startChatgpt: () => request("POST", "/api/v1/coach/chatgpt/start"),
    pollChatgpt: () => request("POST", "/api/v1/coach/chatgpt/poll"),
    saveChatgptModel: (model) => request("PUT", "/api/v1/coach/chatgpt", { model }),
    signOutChatgpt: () => request("DELETE", "/api/v1/coach/chatgpt"),
    openChatgpt: () => { window.open(chatgptPage, "_blank", "noopener,noreferrer"); },
    drafts: (timeZone) => request("GET", `/api/v1/coach/drafts?${new URLSearchParams({ timeZone })}`),
    draftDay: (timeZone) => request<DraftDayDto | null>("POST", `/api/v1/coach/drafts/day?${new URLSearchParams({ timeZone })}`).then(result => result ?? noDraft),
    decide: (draftId, accept, itemIds) => request<DraftDayDto | null>("POST", `/api/v1/coach/drafts/${encodeURIComponent(draftId)}/${accept ? "accept" : "decline"}`, itemIds ? { itemIds } : {})
      .then(result => result ?? { draft: null }),
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
    disconnect: () => command("disconnect_coach"),
    test: async () => (await command<CoachTestResult | null>("test_coach")) ?? notConnected,
    explanations: (timeZone) => command("coach_explanations", { timeZone }),
    startChatgpt: () => command("start_chatgpt_sign_in"),
    pollChatgpt: () => command("poll_chatgpt_sign_in"),
    saveChatgptModel: async (model) => (await command<CoachDto | null>("save_chatgpt_model", { model })) ?? command("coach"),
    signOutChatgpt: () => command("sign_out_chatgpt"),
    openChatgpt: () => { void command("open_chatgpt_sign_in").catch(() => undefined); },
    drafts: (timeZone) => command("coach_drafts", { timeZone }),
    draftDay: async (timeZone) => (await command<DraftDayDto | null>("draft_day", { timeZone })) ?? noDraft,
    decide: async (draftId, accept, itemIds) => (await command<DraftDayDto | null>("decide_draft", { draftId, accept, itemIds: itemIds ?? null })) ?? { draft: null },
  };
}

export const coachKeys = {
  all: (userId: string) => ["user", userId, "coach"] as const,
  provider: (userId: string) => ["user", userId, "coach", "provider"] as const,
  /** `stamp` changes with the season's statuses, so a changed status asks again (the server still caches per day). */
  explanations: (userId: string, stamp: string) => ["user", userId, "coach", "explanations", stamp] as const,
  drafts: (userId: string) => ["user", userId, "coach", "drafts"] as const,
};

export function coachQueries(transport: CoachTransport) {
  return {
    provider: (userId: string) => queryOptions({ queryKey: coachKeys.provider(userId), queryFn: () => transport.get() }),
    // A model call per goal at most once a day (the server caches), so a failure is not retried in a loop.
    explanations: (userId: string, stamp: string) => queryOptions({ queryKey: coachKeys.explanations(userId, stamp), queryFn: () => transport.explanations(localZone()), retry: false, staleTime: 5 * 60_000 }),
    drafts: (userId: string) => queryOptions({ queryKey: coachKeys.drafts(userId), queryFn: () => transport.drafts(localZone()) }),
  };
}

/** Connect and disconnect wait for the server, then refetch the provider and explanations. */
export function coachMutations(transport: CoachTransport, cache: QueryClient, userId: string) {
  const settled = async <T,>(run: () => Promise<T>) => { try { return await run(); } finally { await cache.invalidateQueries({ queryKey: coachKeys.all(userId) }); } };
  return {
    save: (input: CoachProviderInput) => settled(() => transport.save(input)),
    disconnect: () => settled(() => transport.disconnect()),
    test: () => transport.test(),
    saveChatgptModel: (model: string) => settled(() => transport.saveChatgptModel(model)),
    signOutChatgpt: () => settled(() => transport.signOutChatgpt()),
    /** One poll; once signed in, the provider and explanations refetch. */
    pollChatgpt: async () => {
      const result = await transport.pollChatgpt();
      if (result.status === "signed_in") await cache.invalidateQueries({ queryKey: coachKeys.all(userId) });
      return result;
    },
  };
}

/**
 * Ticket 19: drafting and deciding. A decision refetches the tasks (accepted
 * items changed them) and the drafts, also after a refusal (TASK_CHANGED).
 */
export function draftMutations(transport: CoachTransport, cache: QueryClient, userId: string) {
  const replace = (draft: DraftDto | null, id?: string) => cache.setQueryData<DraftsDto>(coachKeys.drafts(userId), current => {
    const others = (current?.drafts ?? []).filter(item => item.id !== (id ?? draft?.id) && item.period !== draft?.period);
    return { drafts: draft ? [...others, draft] : others };
  });
  return {
    draftDay: async () => {
      const result = await transport.draftDay(localZone());
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
