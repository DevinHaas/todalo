import { createHash } from "node:crypto";
import { Elysia } from "elysia";
import {
  CoachModelError, coachProviderInfo, coachProviderInput, explanationFacts, explanationMessages, explanationSchema, ollamaUrl, parseExplanation, parsePing, pingRequest,
  type CoachConfig, type CoachDto, type CoachExplanationsDto, type CoachModel, type CoachProviderDto,
} from "@todalo/server/coach";
import { CoachSecretError } from "@todalo/server/coach-secret";
import { goalStatus, seasonSignals, type StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { todayIn } from "@todalo/server/season-days";
import { writeUser } from "./project-routes";
import { zoneOrUtc } from "./season-routes";

export interface CoachStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** The saved provider with its plaintext key (server-side only), or null. */
  provider(userId: string): Promise<(CoachConfig & { keyLast4: string | null }) | null>;
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
const NO_SECRET = { code: "COACH_NOT_CONFIGURED", message: "This server cannot store API keys yet (COACH_SECRET_KEY is missing)." } as const;

/** The client's view: never the key, only its last four characters. */
const toDto = (config: CoachConfig & { keyLast4: string | null }): CoachProviderDto =>
  ({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, keyHint: config.keyLast4 });

/**
 * Ticket 17: connect an AI provider (an API key, or a local Ollama model) and
 * read the Coach's plain-words explanation of each season goal's status. Every
 * other feature works without a provider; explanations are then just empty.
 */
export function createCoachRoutes(store: CoachStore) {
  const now = store.now ?? (() => new Date());
  const writer = (request: Request) => writeUser(store, request);

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/coach", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      const saved = await store.provider(userId);
      return { provider: saved && toDto(saved) } satisfies CoachDto;
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
        const saved = input.data.apiKey ? null : await store.provider(userId);
        const apiKey = input.data.apiKey ?? (saved?.provider === provider ? saved.apiKey : null);
        if (!apiKey) return status(400, NEEDS_KEY);
        config = { provider, model, baseUrl: null, apiKey };
      }
      try { await store.save(userId, config); }
      catch (error) { if (error instanceof CoachSecretError) return status(503, NO_SECRET); throw error; }
      return { provider: toDto({ ...config, keyLast4: config.apiKey?.slice(-4) ?? null }) } satisfies CoachDto;
    })
    .delete("/coach/provider", async ({ request, status }) => {
      const userId = await writer(request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      await store.remove(userId);
      return { provider: null } satisfies CoachDto;
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
