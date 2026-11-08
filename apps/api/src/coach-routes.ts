import { createHash } from "node:crypto";
import { Elysia } from "elysia";
import {
  CoachModelError, chatgptCompleteInput, chatgptModelInput, chatgptStartInput, coachActiveInput, coachKindParam, coachModelKindParam, coachProviderInput, explanationFacts, explanationMessages, explanationSchema, ollamaUrl, parseExplanation, parsePing, pickCoachProvider, pingRequest,
  type ChatgptCompleteDto, type ChatgptDto, type ChatgptStartDto, type CoachConfig, type CoachDto, type CoachExplanationsDto, type CoachModel, type CoachModelKind, type CoachProviderDto, type CoachProviderKind, type CoachState, type StoredCoachProvider,
} from "@todalo/server/coach";
import {
  agentHostId, chatgptCallbackUrl, chatgptPkce, chatgptSharingScope, ChatgptRefusedError, isLoopback, loopbackRedirect, pastePort, readChatgptCallback, redirectKey,
  type ChatgptAuth, type ChatgptClient, type ChatgptPending, type ChatgptTokens,
} from "@todalo/server/coach-chatgpt";
import { CoachSecretError } from "@todalo/server/coach-secret";
import {
  dismissedThisWeek, parseRecommendation, recommendationFacts, recommendationMessages, recommendationSchema, type CoachRecommendationsDto, type TaskMove,
} from "@todalo/server/coach-recommendations";
import { goalStatus, seasonSignals, type StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { todayIn } from "@todalo/server/season-days";
import { zonedTaskDate } from "@todalo/server/dates";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** Ticket 17c: every configured provider (plaintext keys server-side only), the ChatGPT sign-in and the user's pick. */
  state(userId: string): Promise<CoachState>;
  /** The provider the Coach should use (pickCoachProvider decides whether it can). */
  setActive(userId: string, provider: CoachModelKind): Promise<void>;
  /** Ticket 18: the calls to auth.openai.com (tests: the real one against a fake auth server). */
  chatgptAuth: ChatgptAuth;
  /** OpenAI's registered client for this user and redirect key, kept across sign-ins. */
  chatgptClient(userId: string, redirectKey: string): Promise<ChatgptClient | null>;
  saveChatgptClient(userId: string, redirectKey: string, client: ChatgptClient): Promise<void>;
  forgetChatgptClient(userId: string, redirectKey: string): Promise<void>;
  chatgpt(userId: string): Promise<ChatgptDto | null>;
  /** Encrypts the tokens; throws CoachSecretError without COACH_SECRET_KEY. */
  saveChatgpt(userId: string, tokens: ChatgptTokens): Promise<void>;
  setChatgptModel(userId: string, model: string): Promise<void>;
  /** Sign out (revokes the refresh token at OpenAI, best effort). */
  removeChatgpt(userId: string): Promise<void>;
  /** Saves that kind's configuration (one per kind). Encrypts the key; throws CoachSecretError when no COACH_SECRET_KEY is configured. */
  save(userId: string, config: CoachConfig): Promise<void>;
  /** Removes one provider (every keyed one when omitted), its key and the cached explanations. */
  remove(userId: string, provider?: CoachProviderKind): Promise<void>;
  /** The inference adapter for a config (tests pass a fake). */
  model(config: CoachConfig): CoachModel;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  statusInputs(userId: string, season: { startDate: string; lengthDays: number }): Promise<StatusInputs>;
  cached(userId: string): Promise<{ goalId: string; inputsHash: string; text: string }[]>;
  cache(userId: string, goalId: string, inputsHash: string, text: string): Promise<void>;
  /** Ticket 21: cached recommendations (with their dismissal), one per goal. */
  recommendations(userId: string): Promise<{ goalId: string; inputsHash: string; text: string; dismissedAt: Date | null }[]>;
  cacheRecommendation(userId: string, goalId: string, inputsHash: string, text: string): Promise<void>;
  /** False when the goal has no recommendation. */
  dismissRecommendation(userId: string, goalId: string, at: Date): Promise<boolean>;
  moves(userId: string, since: Date): Promise<TaskMove[]>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const NEEDS_KEY = { code: "INVALID_INPUT", message: "Enter an API key." } as const;
const LOCAL_ONLY = { code: "INVALID_INPUT", message: "Ollama must run on this computer: use a localhost address." } as const;
const NO_RECOMMENDATION = { code: "NOT_FOUND", message: "This recommendation is no longer there." } as const;
const NO_SECRET = { code: "COACH_NOT_CONFIGURED", message: "This server cannot store API keys yet (COACH_SECRET_KEY is missing)." } as const;

/** The client's view: never the key, only its last four characters. */
const toDto = (config: StoredCoachProvider): CoachProviderDto =>
  ({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, keyHint: config.keyLast4 });

/** How long a started sign-in waits for the browser to come back. */
const SIGN_IN_MS = 10 * 60_000;
const NOT_ACTIVE = "This sign-in is no longer active. Start again.";

/** The page the browser shows after OpenAI sent it back to the API (web on localhost). */
const callbackPage = (signedIn: boolean, message: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>todalo</title>
<body style="font:16px system-ui;margin:3rem auto;max-width:32rem;padding:0 1rem"><h1 style="font-size:1.25rem">${signedIn ? "ChatGPT is connected" : "ChatGPT sign-in failed"}</h1>
<p>${message.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}</p></body>`,
  { status: signedIn ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

/**
 * Ticket 17: connect an AI provider (an API key, or a local Ollama model) and
 * read the Coach's plain-words explanation of each season goal's status. Every
 * other feature works without a provider; explanations are then just empty.
 */
export function createCoachRoutes(store: CoachStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const toCoachDto = ({ configured, chatgpt, chosen }: CoachState): CoachDto => {
    const { selected, provider } = pickCoachProvider(configured, chosen);
    return {
      provider: provider && toDto(provider), selected: selected?.provider ?? null, chatgpt,
      providers: configured.filter(item => item.provider !== "chatgpt").map(toDto),
    };
  };
  const dto = async (userId: string) => toCoachDto(await store.state(userId));
  /** The provider the Coach runs on now, or null. */
  const active = async (userId: string) => { const { configured, chosen } = await store.state(userId); return pickCoachProvider(configured, chosen).provider; };
  // Ticket 18: sign-ins in progress by state. The PKCE verifier stays here, never in a client.
  // ponytail: in memory, so a restart or a second API instance drops it (the user starts again).
  const signIns = new Map<string, ChatgptPending & { userId: string; expiresAt: number }>();

  /** OpenAI's redirect back: checks it belongs to this user's sign-in, exchanges the code, saves the tokens. */
  async function complete(userId: string, params: URLSearchParams, returnedTo: URL | null): Promise<ChatgptCompleteDto> {
    const pending = signIns.get(params.get("state") ?? "");
    if (!pending || pending.userId !== userId) return { status: "failed", message: NOT_ACTIVE };
    signIns.delete(pending.state);
    if (now().getTime() > pending.expiresAt) return { status: "failed", message: NOT_ACTIVE };
    const key = redirectKey(pending.redirectUri);
    try {
      const { code, clientId } = readChatgptCallback(params, pending, returnedTo);
      // Cached before the exchange, so even a failed exchange does not register todalo again.
      if (!pending.clientId) await store.saveChatgptClient(userId, key, { clientId, email: null, sharing: true });
      const tokens = await store.chatgptAuth.exchange({ clientId, code, verifier: pending.verifier, redirectUri: pending.redirectUri, nonce: pending.nonce });
      const sharing = tokens.scopes.includes(chatgptSharingScope);
      await store.saveChatgptClient(userId, key, { clientId, email: tokens.email, sharing });
      if (!sharing) return { status: "failed", message: "OpenAI did not share your ChatGPT plan. Sign in again and allow sharing of your ChatGPT plan." };
      await store.saveChatgpt(userId, tokens);
      return { status: "signed_in" };
    } catch (error) {
      if (error instanceof ChatgptRefusedError && error.badClient) await store.forgetChatgptClient(userId, key);
      if (error instanceof CoachSecretError) return { status: "failed", message: NO_SECRET.message };
      if (error instanceof ChatgptRefusedError || error instanceof CoachModelError) return { status: "failed", message: error.message };
      throw error;
    }
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/coach", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return dto(userId);
    })
    .put("/coach/provider", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = coachProviderInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const { provider, model } = input.data;
      let config: CoachConfig;
      if (provider === "ollama") {
        const baseUrl = ollamaUrl(input.data.baseUrl);
        if (!baseUrl) return status(400, LOCAL_ONLY);
        config = { provider, model, baseUrl, apiKey: null };
      } else {
        // Changing only the model keeps that provider's saved key; another provider needs its own.
        const saved = input.data.apiKey ? null : (await store.state(userId)).configured.find(item => item.provider === provider);
        const apiKey = input.data.apiKey ?? saved?.apiKey ?? null;
        if (!apiKey) return status(400, NEEDS_KEY);
        config = { provider, model, baseUrl: null, apiKey };
      }
      try { await store.save(userId, config); }
      catch (error) { if (error instanceof CoachSecretError) return status(503, NO_SECRET); throw error; }
      return dto(userId);
    })
    // ?provider= disconnects that one; without it every keyed provider (ticket 17's single provider).
    .delete("/coach/provider", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const kind = coachKindParam.safeParse(new URL(request.url).searchParams.get("provider") ?? undefined);
      if (!kind.success) return status(400, INVALID);
      await store.remove(userId, kind.data);
      return dto(userId);
    })
    // Ticket 17c: the provider the Coach uses; only a configured one.
    .put("/coach/active", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = coachActiveInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      if (!(await store.state(userId)).configured.some(item => item.provider === input.data.provider)) return status(404, NO_PROVIDER);
      await store.setActive(userId, input.data.provider);
      return dto(userId);
    })
    // Ticket 18: ChatGPT sign-in, T3 Code's flow (coach-chatgpt.ts). Start
    // returns OpenAI's page; the browser comes back to the Mac app's loopback
    // listener (it forwards the address to complete), to the callback route
    // (web on localhost), or the user pastes the address (web elsewhere:
    // OpenAI accepts only loopback redirects). Failures are a 200 with a
    // message, like Test connection, so they reach the native client.
    .post("/coach/chatgpt/start", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = chatgptStartInput.safeParse(body ?? {});
      if (!input.success) return status(400, INVALID);
      // writer() let a cookie request through only from an allowed origin.
      const origin = request.headers.get("origin");
      const [redirectUri, mode]: [string, NonNullable<ChatgptStartDto["mode"]>] = input.data.port ? [loopbackRedirect(input.data.port), "loopback"]
        : origin && isLoopback(origin) ? [`${origin}/api/v1/coach/chatgpt/callback`, "callback"]
        : [loopbackRedirect(pastePort()), "paste"];
      try {
        const client = await store.chatgptClient(userId, redirectKey(redirectUri));
        const { state, nonce, verifier, challenge } = chatgptPkce();
        const authorizeUrl = await store.chatgptAuth.authorizeUrl({
          clientId: client?.clientId ?? null, loginHint: client?.email, consent: client?.sharing === false,
          redirectUri, hostId: agentHostId(userId), state, nonce, challenge,
        });
        // One sign-in per user at a time.
        for (const [key, entry] of signIns) if (entry.userId === userId) signIns.delete(key);
        signIns.set(state, { state, nonce, verifier, redirectUri, clientId: client?.clientId ?? null, userId, expiresAt: now().getTime() + SIGN_IN_MS });
        return { authorizeUrl, mode } satisfies ChatgptStartDto;
      } catch (error) {
        if (error instanceof CoachModelError) return { authorizeUrl: null, message: error.message } satisfies ChatgptStartDto;
        throw error;
      }
    })
    .post("/coach/chatgpt/complete", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = chatgptCompleteInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const url = chatgptCallbackUrl(input.data.callbackUrl);
      if (!url) return { status: "failed", message: "Paste the full address from your browser's address bar." } satisfies ChatgptCompleteDto;
      return complete(userId, url.searchParams, url);
    })
    // The browser itself arrives here (a top-level navigation with the session
    // cookie); the state must belong to that signed-in user.
    .get("/coach/chatgpt/callback", async ({ request }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return callbackPage(false, "Sign in to todalo in this browser, then start the ChatGPT sign-in again.");
      const result = await complete(userId, new URL(request.url).searchParams, null);
      return result.status === "signed_in"
        ? callbackPage(true, "The Coach now runs on your ChatGPT plan. You can close this tab and return to todalo.")
        : callbackPage(false, result.message ?? NOT_ACTIVE);
    })
    .put("/coach/chatgpt", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = chatgptModelInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      if (!await store.chatgpt(userId)) return status(404, NO_PROVIDER);
      await store.setChatgptModel(userId, input.data.model);
      return dto(userId);
    })
    // Sign out: the tokens go and the saved key (if any) takes over.
    .delete("/coach/chatgpt", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      for (const [key, entry] of signIns) if (entry.userId === userId) signIns.delete(key);
      await store.removeChatgpt(userId);
      return dto(userId);
    })
    // Test connection: one tiny structured request with the active provider,
    // or the one named by ?provider= (its card). A provider failure is a 200
    // { ok: false, message } so the reason reaches the native client too (its
    // write mapping replaces error bodies).
    .post("/coach/provider/test", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const kind = coachModelKindParam.safeParse(new URL(request.url).searchParams.get("provider") ?? undefined);
      if (!kind.success) return status(400, INVALID);
      const { configured, chosen } = await store.state(userId);
      const pick = pickCoachProvider(configured, chosen);
      // Nothing can run: test the pick anyway, so it says why.
      const saved = kind.data ? configured.find(item => item.provider === kind.data) : pick.provider ?? pick.selected;
      if (!saved) return status(404, NO_PROVIDER);
      if (!saved.usable) return { ok: false, message: saved.provider === "chatgpt" ? "ChatGPT signed you out. Sign in again." : "Enter your API key again." };
      try { parsePing(await store.model(saved).complete(pingRequest, request.signal)); }
      catch (error) { return { ok: false, message: error instanceof CoachModelError ? error.message : "The provider is unavailable. Try again later." }; }
      return { ok: true };
    })
    // Each current-season goal's explanation, from its computed status facts only.
    // Cached per goal until the facts, provider, model or day change, so a page load rarely calls the model.
    .get("/coach/explanations", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const measured = await seasonFacts(userId, request);
      if (!measured) return { explanations: {} } satisfies CoachExplanationsDto;
      const cached = new Map((await store.cached(userId)).map(row => [row.goalId, row]));
      const entries = await Promise.all(measured.goals.map(({ goal, facts }) => facts && ask(measured, facts, cached.get(goal.goalId), request.signal,
        { messages: explanationMessages(facts), schema: explanationSchema }, parseExplanation, (hash, text) => store.cache(userId, goal.goalId, hash, text))
        .then(text => text === null ? null : [goal.goalId, text] as const)));
      return { explanations: Object.fromEntries(entries.filter(entry => entry != null)) } satisfies CoachExplanationsDto;
    })
    // Ticket 21: one recommendation per Adjust or Off track goal, from its status
    // facts plus how its tasks were done, scheduled and moved. Cached like the
    // explanations; a dismissed one stays hidden (and unasked) for the rest of that season week.
    .get("/coach/recommendations", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const measured = await seasonFacts(userId, request);
      if (!measured) return { recommendations: [] } satisfies CoachRecommendationsDto;
      const { season, zone, today, clock, inputs } = measured;
      const cached = new Map((await store.recommendations(userId)).map(row => [row.goalId, row]));
      const moves = await store.moves(userId, zonedTaskDate(season.startDate, "00:00", zone)!);
      const entries = await Promise.all(measured.goals.map(async ({ goal, facts: explanation }) => {
        const hit = cached.get(goal.goalId);
        if (dismissedThisWeek(hit?.dismissedAt ?? null, { startDate: season.startDate, today, zone })) return null;
        const facts = recommendationFacts({ explanation, goalId: goal.goalId, startDate: season.startDate, zone, now: clock, links: inputs.links, tasks: inputs.tasks, moves });
        if (!facts) return null;
        const text = await ask(measured, facts, hit, request.signal, { messages: recommendationMessages(facts), schema: recommendationSchema }, parseRecommendation,
          (hash, value) => store.cacheRecommendation(userId, goal.goalId, hash, value));
        return text === null ? null : { goalId: goal.goalId, text };
      }));
      return { recommendations: entries.filter(entry => entry !== null) } satisfies CoachRecommendationsDto;
    })
    .post("/coach/recommendations/:goalId/dismiss", async ({ request, params, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (!await store.dismissRecommendation(userId, params.goalId, now())) return status(404, NO_RECOMMENDATION);
      return { ok: true };
    });

  /** The current season's goals with their status facts (null while Too early), or null without a provider or season. */
  async function seasonFacts(userId: string, request: Request) {
    const saved = await active(userId);
    if (!saved) return null;
    const current = await store.season(userId);
    if (!current) return null;
    const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
    const clock = now(), today = todayIn(zone, clock);
    const { season } = current;
    const seasonGoals = current.goals.filter(goal => !goal.archivedAt);
    const inputs = await store.statusInputs(userId, season);
    const { day, perGoal } = seasonSignals({ ...season, today, now: clock, zone, goalIds: seasonGoals.map(goal => goal.goalId), inputs });
    const goals = seasonGoals.map(goal => {
      const weeks = perGoal.get(goal.goalId)!;
      return { goal, facts: explanationFacts({ goal, weeks, day, length: season.lengthDays, status: goalStatus({ day, length: season.lengthDays, weeks, reviewed: inputs.reviewed }) }) };
    });
    return { saved, season, zone, clock, today, inputs, goals };
  }

  /**
   * One goal's Coach text: the cached one while its facts, provider, model and
   * day are unchanged, else one model call. A failure hides only that goal's
   * text (null); Test connection shows why.
   */
  async function ask(measured: { saved: CoachConfig; today: string }, facts: unknown, hit: { inputsHash: string; text: string } | undefined, signal: AbortSignal,
    request: Parameters<CoachModel["complete"]>[0], parse: (content: string) => string, save: (hash: string, text: string) => Promise<void>): Promise<string | null> {
    const { saved, today } = measured;
    const hash = createHash("sha256").update(JSON.stringify({ facts, provider: saved.provider, model: saved.model, today })).digest("hex");
    if (hit?.inputsHash === hash) return hit.text;
    try {
      const text = parse(await store.model(saved).complete(request, signal));
      await save(hash, text);
      return text;
    } catch (error) {
      if (error instanceof CoachModelError || (error instanceof Error && error.name === "AbortError")) return null;
      throw error;
    }
  }
}
