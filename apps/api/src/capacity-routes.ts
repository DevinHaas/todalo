import { createHash } from "node:crypto";
import { Elysia } from "elysia";
import { CoachModelError, type CoachConfig, type CoachModel } from "@todalo/server/coach";
import { withPatterns, type PatternRecord } from "@todalo/server/coach-patterns";
import { capacityFacts, capacityInput, capacityMessages, capacitySchema, capacityVerdict, parseCapacity, type CapacityDto, type CapacityGoalDto } from "@todalo/server/coach-suggestions";
import type { SeasonGoalRecord, SeasonRecord } from "@todalo/server/season-dto";
import { writeUser } from "./project-routes";

export interface CapacityStore {
  verify(headers: Headers): Promise<string | null>;
  allowedOrigins: ReadonlySet<string>;
  /** The provider the Coach runs on now, or null. */
  provider(userId: string): Promise<CoachConfig | null>;
  model(config: CoachConfig): CoachModel;
  season(userId: string): Promise<{ season: SeasonRecord; goals: SeasonGoalRecord[] } | null>;
  capacity(userId: string): Promise<{ availableMinutes: number | null; inputsHash: string | null; estimate: CapacityGoalDto[] | null } | null>;
  saveAvailable(userId: string, availableMinutes: number | null): Promise<void>;
  cache(userId: string, inputsHash: string, estimate: CapacityGoalDto[]): Promise<void>;
  /** Ticket 24: the user's stored patterns, the only ones a Coach prompt may use. */
  patterns?(userId: string): Promise<PatternRecord[]>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

/**
 * Goals ticket 25: the Coach's estimate of the hours a week the current
 * season's primary goals need, against the time the user says they have. One
 * model call per set of primary goals (titles, targets, season length), cached;
 * without a provider only the user's own number comes back.
 */
export function createCapacityRoutes(store: CapacityStore) {
  async function read(userId: string, signal: AbortSignal): Promise<CapacityDto> {
    const [saved, config, current, stored] = await Promise.all([store.capacity(userId), store.provider(userId), store.season(userId), store.patterns?.(userId) ?? []]);
    const patterns = stored.map(({ statement }) => ({ statement }));
    const availableMinutes = saved?.availableMinutes ?? null;
    const primary = current?.goals.filter(goal => goal.tier === "primary" && !goal.archivedAt) ?? [];
    const built = config && current ? capacityFacts(current.season.lengthDays, primary) : null;
    let goals: CapacityGoalDto[] | null = null;
    if (config && built) {
      const hash = createHash("sha256").update(JSON.stringify({ facts: built.facts, ids: [...built.refs.values()], provider: config.provider, model: config.model, ...patterns.length ? { patterns } : {} })).digest("hex");
      if (saved?.inputsHash === hash && saved.estimate) goals = saved.estimate;
      else try {
        goals = parseCapacity(await store.model(config).complete({ messages: withPatterns(capacityMessages(built.facts), patterns), schema: capacitySchema }, signal), built.refs);
        await store.cache(userId, hash, goals);
      } catch (error) {
        // A failure shows no estimate; Test connection says why.
        if (!(error instanceof CoachModelError || (error instanceof Error && error.name === "AbortError"))) throw error;
      }
    }
    return { availableMinutes, goals, ...capacityVerdict(goals, availableMinutes) };
  }

  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/coach/capacity", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return read(userId, request.signal);
    })
    .put("/coach/capacity", async ({ request, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = capacityInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      await store.saveAvailable(userId, input.data.availableMinutes);
      return read(userId, request.signal);
    });
}
