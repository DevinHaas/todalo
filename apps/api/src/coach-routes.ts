import { createHash } from "node:crypto";
import { Elysia } from "elysia";
import {
  CoachModelError, chatgptModelInput, coachProviderInfo, coachProviderInput, explanationFacts, explanationMessages, explanationSchema, ollamaUrl, parseExplanation, parsePing, pingRequest,
  type ChatgptDto, type ChatgptSignInDto, type CoachConfig, type CoachDto, type CoachExplanationsDto, type CoachModel, type CoachProviderDto,
} from "@todalo/server/coach";
import { chatgptVerificationUrl, ChatgptRefusedError, type ChatgptAuth, type ChatgptDeviceCode, type ChatgptTokens } from "@todalo/server/coach-chatgpt";
import { CoachSecretError } from "@todalo/server/coach-secret";
import { goalStatus, seasonSignals, type StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { todayIn } from "@todalo/server/season-days";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** The provider the Coach runs on now (ChatGPT while signed in, else the saved key), plaintext key server-side only, or null. */
  provider(userId: string): Promise<(CoachConfig & { keyLast4: string | null }) | null>;
  /** The saved API key or Ollama provider alone (the fallback), or null. */
  keyProvider(userId: string): Promise<(CoachConfig & { keyLast4: string | null }) | null>;
  /** Ticket 18: this server's ChatGPT sign-in, null when it offers none (no OAuth client configured). */
  chatgptAuth: ChatgptAuth | null;
  chatgpt(userId: string): Promise<ChatgptDto | null>;
  /** Encrypts the tokens; throws CoachSecretError without COACH_SECRET_KEY. */
  saveChatgpt(userId: string, tokens: ChatgptTokens): Promise<void>;
  setChatgptModel(userId: string, model: string): Promise<void>;
  removeChatgpt(userId: string): Promise<void>;
  /** Encrypts the key; throws CoachSecretError when no COACH_SECRET_KEY is configured. */
  save(userId: string, config: CoachConfig): Promise<void>;
  /** Removes the provider, its key and the cached explanations. */
  remove(userId: string): Promise<void>;
  /** The inference adapter for a config (tests pass a fake). */
  model(config: CoachConfig): CoachModel;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  statusInputs(userId: string, season: { startDate: string; lengthDays: number }): Promise<StatusInputs>;
  cached(userId: string): Promise<{ goalId: string; inputsHash: string; text: string }[]>;
  cache(userId: string, goalId: string, inputsHash: string, text: string): Promise<void>;
  now?: () => Date;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NO_PROVIDER = { code: "NO_PROVIDER", message: "Connect an AI provider first." } as const;
const NEEDS_KEY = { code: "INVALID_INPUT", message: "Enter an API key." } as const;
const LOCAL_ONLY = { code: "INVALID_INPUT", message: "Ollama must run on this computer: use a localhost address." } as const;
const NO_CHATGPT = "This server does not offer ChatGPT sign-in yet. Use an API key instead.";
const NO_SECRET = { code: "COACH_NOT_CONFIGURED", message: "This server cannot store API keys yet (COACH_SECRET_KEY is missing)." } as const;

/** The client's view: never the key, only its last four characters. */
const toDto = (config: CoachConfig & { keyLast4: string | null }): CoachProviderDto =>
  ({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, keyHint: config.keyLast4 });

/** A device code is good for 15 minutes (OpenAI's limit). */
const SIGN_IN_MS = 15 * 60_000;

/**
 * Ticket 17: connect an AI provider (an API key, or a local Ollama model) and
 * read the Coach's plain-words explanation of each season goal's status. Every
 * other feature works without a provider; explanations are then just empty.
 */
export function createCoachRoutes(store: CoachStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);
  const dto = async (userId: string): Promise<CoachDto> => {
    const [active, key, chatgpt] = await Promise.all([store.provider(userId), store.keyProvider(userId), store.chatgpt(userId)]);
    return { provider: active && toDto(active), keyProvider: key && toDto(key), chatgpt, chatgptAvailable: store.chatgptAuth !== null };
  };
  // Ticket 18: sign-ins in progress. The device code stays here, never in the client.
  // ponytail: in memory, so a restart or a second API instance drops it (the user starts again).
  const signIns = new Map<string, { code: ChatgptDeviceCode; expiresAt: number; nextPollAt: number }>();

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
        // Changing only the model keeps the saved key; a new provider needs its own.
        const saved = input.data.apiKey ? null : await store.keyProvider(userId);
        const apiKey = input.data.apiKey ?? (saved?.provider === provider ? saved.apiKey : null);
        if (!apiKey) return status(400, NEEDS_KEY);
        config = { provider, model, baseUrl: null, apiKey };
      }
      try { await store.save(userId, config); }
      catch (error) { if (error instanceof CoachSecretError) return status(503, NO_SECRET); throw error; }
      return dto(userId);
    })
    .delete("/coach/provider", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      await store.remove(userId);
      return dto(userId);
    })
    // Ticket 18: ChatGPT sign-in with OpenAI's device code. Start shows a code
    // to enter at OpenAI; the client then polls until the user approved. Like
    // Test connection, failures are a 200 with a message for the native client.
    .post("/coach/chatgpt/start", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      if (!store.chatgptAuth) return { signIn: null, message: NO_CHATGPT } satisfies ChatgptSignInDto;
      try {
        const code = await store.chatgptAuth.start();
        const clock = now().getTime();
        signIns.set(userId, { code, expiresAt: clock + SIGN_IN_MS, nextPollAt: clock + code.intervalSeconds * 1000 });
        return { signIn: { userCode: code.userCode, verificationUrl: chatgptVerificationUrl, intervalSeconds: code.intervalSeconds } } satisfies ChatgptSignInDto;
      } catch (error) {
        if (error instanceof CoachModelError) return { signIn: null, message: error.message } satisfies ChatgptSignInDto;
        throw error;
      }
    })
    .post("/coach/chatgpt/poll", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const pending = signIns.get(userId);
      if (!pending || !store.chatgptAuth) return { status: "failed", message: "Start the sign-in again." } as const;
      const clock = now().getTime();
      if (clock > pending.expiresAt) { signIns.delete(userId); return { status: "failed", message: "The code expired. Start the sign-in again." } as const; }
      // At most one call to OpenAI per interval, however often the client asks.
      if (clock < pending.nextPollAt) return { status: "pending" } as const;
      pending.nextPollAt = clock + pending.code.intervalSeconds * 1000;
      try {
        const tokens = await store.chatgptAuth.poll(pending.code);
        if (!tokens) return { status: "pending" } as const;
        signIns.delete(userId);
        await store.saveChatgpt(userId, tokens);
        return { status: "signed_in" } as const;
      } catch (error) {
        if (error instanceof ChatgptRefusedError || error instanceof CoachSecretError) signIns.delete(userId);
        if (error instanceof CoachSecretError) return { status: "failed", message: NO_SECRET.message } as const;
        if (error instanceof ChatgptRefusedError) return { status: "failed", message: error.message } as const;
        if (error instanceof CoachModelError) return { status: "pending", message: error.message } as const;
        throw error;
      }
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
      signIns.delete(userId);
      await store.removeChatgpt(userId);
      return dto(userId);
    })
    // Test connection: one tiny structured request with the saved provider. A
    // provider failure is a 200 { ok: false, message } so the reason reaches
    // the native client too (its write mapping replaces error bodies).
    .post("/coach/provider/test", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const saved = await store.provider(userId);
      if (!saved) return status(404, NO_PROVIDER);
      if (coachProviderInfo[saved.provider].needsKey && !saved.apiKey) return { ok: false, message: "Enter your API key again." };
      try { parsePing(await store.model(saved).complete(pingRequest, request.signal)); }
      catch (error) { return { ok: false, message: error instanceof CoachModelError ? error.message : "The provider is unavailable. Try again later." }; }
      return { ok: true };
    })
    // Each current-season goal's explanation, from its computed status facts only.
    // Cached per goal until the facts, provider, model or day change, so a page load rarely calls the model.
    .get("/coach/explanations", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const none = { explanations: {} } satisfies CoachExplanationsDto;
      const saved = await store.provider(userId);
      if (!saved || (coachProviderInfo[saved.provider].needsKey && !saved.apiKey)) return none;
      const current = await store.season(userId);
      if (!current) return none;
      const zone = zoneOrUtc(new URL(request.url).searchParams.get("timeZone"));
      const clock = now(), today = todayIn(zone, clock);
      const { season } = current;
      const goals = current.goals.filter(goal => !goal.archivedAt);
      const inputs = await store.statusInputs(userId, season);
      const { day, perGoal } = seasonSignals({ ...season, today, now: clock, zone, goalIds: goals.map(goal => goal.goalId), inputs });
      const cached = new Map((await store.cached(userId)).map(row => [row.goalId, row]));
      const model = store.model(saved);
      const entries = await Promise.all(goals.map(async (goal): Promise<[string, string] | null> => {
        const weeks = perGoal.get(goal.goalId)!;
        const facts = explanationFacts({ goal, weeks, day, length: season.lengthDays, status: goalStatus({ day, length: season.lengthDays, weeks, reviewed: inputs.reviewed }) });
        if (!facts) return null;
        const hash = createHash("sha256").update(JSON.stringify({ facts, provider: saved.provider, model: saved.model, today })).digest("hex");
        const hit = cached.get(goal.goalId);
        if (hit?.inputsHash === hash) return [goal.goalId, hit.text];
        try {
          const text = parseExplanation(await model.complete({ messages: explanationMessages(facts), schema: explanationSchema }, request.signal));
          await store.cache(userId, goal.goalId, hash, text);
          return [goal.goalId, text];
        } catch (error) {
          // One goal's failed explanation hides only that explanation; Test connection shows why.
          if (error instanceof CoachModelError || (error instanceof Error && error.name === "AbortError")) return null;
          throw error;
        }
      }));
      return { explanations: Object.fromEntries(entries.filter(entry => entry !== null)) } satisfies CoachExplanationsDto;
    });
}
