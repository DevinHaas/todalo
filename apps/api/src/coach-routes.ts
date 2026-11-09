import { createHash } from "node:crypto";
import { Elysia } from "elysia";
import {
  CoachModelError, coachErrorDto, type CoachErrorDto, chatgptCompleteInput, chatgptModelInput, chatgptStartInput, coachActiveInput, coachKindParam, coachModelKindParam, coachProviderInput, explanationFacts, explanationMessages, explanationSchema, ollamaUrl, parseExplanation, parsePing, pickCoachProvider, pingRequest,
  type ChatgptCompleteDto, type ChatgptDto, type ChatgptStartDto, type CoachConfig, type CoachDto, type CoachExplanationsDto, type CoachModel, type CoachModelKind, type CoachProviderDto, type CoachProviderKind, type CoachState, type StoredCoachProvider,
} from "@todalo/server/coach";
import {
  agentHostId, chatgptCallbackUrl, chatgptPkce, chatgptSharingScope, ChatgptRefusedError, isLoopback, loopbackRedirect, pastePort, readChatgptCallback, redirectKey,
  type ChatgptAuth, type ChatgptClient, type ChatgptPending, type ChatgptTokens,
} from "@todalo/server/coach-chatgpt";
import { CoachSecretError } from "@todalo/server/coach-secret";
import { coachModelsInput, fallbackModels, listCoachModels, type CoachModelsDto } from "@todalo/server/coach-models";
import {
  dismissedThisWeek, parseRecommendation, recommendationFacts, recommendationMessages, recommendationSchema, type CoachRecommendationsDto, type TaskMove,
} from "@todalo/server/coach-recommendations";
import { withPatterns, type PatternRecord } from "@todalo/server/coach-patterns";
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
  /** Ticket 24: the user's Patterns, sent with every explanation and recommendation. */
  patterns?(userId: string): Promise<PatternRecord[]>;
  /** The model picker's calls to each provider's model list (tests: a fake provider). */
  modelsFetch?: typeof fetch;
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
/** How long a provider's model list is reused. */
const MODELS_MS = 10 * 60_000;
const NOT_ACTIVE = "This sign-in is no longer active. Start again.";

/**
 * The callback page's styles: the app's theme colors, light and dark.
 * ponytail: duplicated in apps/client/src-tauri/src/coach.rs (CALLBACK_STYLE); keep the two in sync.
 */
const callbackStyle = ":root{color-scheme:light dark;--bg:#f7f7f7;--card:#fff;--fg:#202020;--muted:#666;--border:#e6e6e6;--ok:#058527;--bad:#d1453b;--brand:#dc4c3e}"
  + "@media (prefers-color-scheme:dark){:root{--bg:#1e1e1e;--card:#262626;--fg:#e6e6e6;--muted:#a3a3a3;--border:#3d3d3d;--ok:#25b84c;--bad:#ff7066;--brand:#de4c4a}}"
  + "*{box-sizing:border-box}"
  + "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased}"
  + "main{width:100%;max-width:26rem;padding:2.25rem 2rem 2rem;background:var(--card);border:1px solid var(--border);border-radius:1rem;box-shadow:0 1px 2px #0000000d,0 12px 32px #00000014;text-align:center}"
  + ".icon{display:grid;place-items:center;width:3rem;height:3rem;margin:0 auto 1.25rem;border-radius:999px;color:var(--tone);background:color-mix(in srgb,var(--tone) 14%,transparent)}"
  + ".icon svg{width:1.5rem;height:1.5rem}"
  + "h1{margin:0 0 .5rem;font-size:1.25rem;font-weight:600;letter-spacing:-.01em}"
  + "p{margin:0;color:var(--muted)}"
  + ".brand{margin-top:1.75rem;font-size:.8125rem;font-weight:700;letter-spacing:.02em;color:var(--brand)}";

/** The page the browser shows after OpenAI sent it back to the API (web on localhost). */
const callbackPage = (signedIn: boolean, message: string) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>todalo</title><style>${callbackStyle}</style>
<body><main style="--tone:var(--${signedIn ? "ok" : "bad"})"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${signedIn ? "M20 6 9 17l-5-5" : "M18 6 6 18M6 6l12 12"}"/></svg></div>
<h1>${signedIn ? "ChatGPT is connected" : "ChatGPT sign-in failed"}</h1>
<p>${message.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}</p><div class="brand">todalo</div></main></body>`,
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
  // Model lists by user, provider and a hash of the credential used.
  // ponytail: in memory per process, like signIns; a shared cache only if several instances matter.
  const modelLists = new Map<string, { expiresAt: number; dto: CoachModelsDto }>();

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
    // The model picker: that provider's models, asked with its saved key or
    // sign-in, or a key / Ollama address typed but not saved yet (body). Never
    // logged or returned. Any failure is a 200 with the curated list, so the
    // user is never stuck (Custom model… stays in the picker).
    .post("/coach/models", async ({ request, body, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const kind = coachModelKindParam.safeParse(new URL(request.url).searchParams.get("provider") ?? undefined);
      const input = coachModelsInput.safeParse(body ?? {});
      if (!kind.success || !kind.data || !input.success) return status(400, INVALID);
      const provider = kind.data;
      const saved = (await store.state(userId)).configured.find(item => item.provider === provider);
      const apiKey = (provider === "chatgpt" ? null : input.data.apiKey) ?? saved?.apiKey ?? null;
      const baseUrl = provider === "ollama" ? input.data.baseUrl || saved?.baseUrl || null : null;
      // OpenRouter lists its models without a key; the others need one.
      if (!apiKey && provider !== "ollama" && provider !== "openrouter")
        return fallbackModels(provider, provider === "chatgpt" ? "Sign in with ChatGPT to see its models." : "Enter your API key to see every model.");
      const key = `${userId} ${provider} ${createHash("sha256").update(`${apiKey ?? ""} ${baseUrl ?? ""}`).digest("hex")}`;
      const hit = modelLists.get(key);
      if (hit && hit.expiresAt > now().getTime()) return hit.dto;
      const dto = await listCoachModels(provider, apiKey, baseUrl, store.modelsFetch ?? fetch, request.signal, now().getTime());
      if (!dto.fallback) {
        for (const [old, entry] of modelLists) if (entry.expiresAt <= now().getTime()) modelLists.delete(old);
        modelLists.set(key, { expiresAt: now().getTime() + MODELS_MS, dto });
      }
      return dto;
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
      if (!saved.usable) {
        const failed = saved.provider === "chatgpt" ? new CoachModelError("ChatGPT signed you out. Sign in again.", "auth_expired", "chatgpt") : new CoachModelError("Enter your API key again.", "bad_key", saved.provider);
        return { ok: false, message: failed.message, error: coachErrorDto(failed) };
      }
      try { parsePing(await store.model(saved).complete(pingRequest, request.signal)); }
      catch (error) {
        const failed = error instanceof CoachModelError ? error : new CoachModelError("The provider is unavailable. Try again later.", "overloaded");
        return { ok: false, message: failed.message, error: coachErrorDto(failed, saved.provider) };
      }
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
      return { explanations: Object.fromEntries(entries.filter(entry => entry != null)), ...measured.error && { error: measured.error } } satisfies CoachExplanationsDto;
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
      return { recommendations: entries.filter(entry => entry !== null), ...measured.error && { error: measured.error } } satisfies CoachRecommendationsDto;
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
    const [inputs, patterns] = await Promise.all([store.statusInputs(userId, season), store.patterns?.(userId) ?? []]);
    const { day, perGoal } = seasonSignals({ ...season, today, now: clock, zone, goalIds: seasonGoals.map(goal => goal.goalId), inputs });
    const goals = seasonGoals.map(goal => {
      const weeks = perGoal.get(goal.goalId)!;
      return { goal, facts: explanationFacts({ goal, weeks, day, length: season.lengthDays, status: goalStatus({ day, length: season.lengthDays, weeks, reviewed: inputs.reviewed }) }) };
    });
    return { saved, season, zone, clock, today, inputs, goals, patterns: patterns.map(({ statement }) => ({ statement })), error: undefined as CoachErrorDto | undefined };
  }

  /**
   * One goal's Coach text: the cached one while its facts, provider, model and
   * day are unchanged, else one model call. A failure hides only that goal's
   * text (null); the first failure goes to `measured.error` (ticket 17d) for the reply.
   */
  async function ask(measured: { saved: CoachConfig; today: string; patterns: { statement: string }[]; error?: CoachErrorDto }, facts: unknown, hit: { inputsHash: string; text: string } | undefined, signal: AbortSignal,
    request: Parameters<CoachModel["complete"]>[0], parse: (content: string) => string, save: (hash: string, text: string) => Promise<void>): Promise<string | null> {
    const { saved, today, patterns } = measured;
    // Ticket 24: an edited or deleted pattern asks again (no patterns: the hash is unchanged).
    const hash = createHash("sha256").update(JSON.stringify({ facts, provider: saved.provider, model: saved.model, today, ...patterns.length ? { patterns } : {} })).digest("hex");
    if (hit?.inputsHash === hash) return hit.text;
    try {
      const text = parse(await store.model(saved).complete({ ...request, messages: withPatterns(request.messages, patterns) }, signal));
      await save(hash, text);
      return text;
    } catch (error) {
      if (error instanceof CoachModelError) { measured.error ??= coachErrorDto(error, saved.provider); return null; }
      if (error instanceof Error && error.name === "AbortError") return null;
      throw error;
    }
  }
}
