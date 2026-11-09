import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { CapacityDto, CapacityGoalDto } from "@todalo/server/coach-suggestions";
import type { SeasonGoalRecord } from "@todalo/server/season-dto";
import { createCapacityRoutes } from "./capacity-routes";

// Goals ticket 25 at the API seam: in-memory fakes and a fake provider with canned replies.
const goal = (goalId: string, title: string, tier: "primary" | "secondary", target: string, archivedAt: Date | null = null): SeasonGoalRecord =>
  ({ id: `sg-${goalId}`, goalId, title, color: "blue", archivedAt, tier, target, carriedFromId: null });
let config: CoachConfig | null;
let seasonGoals: SeasonGoalRecord[];
let replies: (string | Error)[];
let asked: CoachMessage[][];
let patterns: { id: string; statement: string; evidence: string; source: string; learnedAt: Date; editedAt: Date | null }[];
let saved: Map<string, { availableMinutes: number | null; inputsHash: string | null; estimate: CapacityGoalDto[] | null }>;
beforeEach(() => {
  config = { provider: "openrouter", model: "fake", baseUrl: null, apiKey: "key" };
  seasonGoals = [goal("fit", "Run a marathon", "primary", "Finish in under 4 hours"), goal("v2", "Ship v2", "primary", "Launch to customers"), goal("read", "Read more", "secondary", "6 books"), goal("old", "Old", "primary", "x", new Date())];
  replies = []; asked = []; saved = new Map(); patterns = [];
});

const app = createCapacityRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async () => config,
  model: () => ({ complete: async ({ messages }) => { asked.push(messages); const reply = replies.shift() ?? "{}"; if (reply instanceof Error) throw reply; return reply; } }),
  season: async (userId) => userId === "alice" ? { season: { id: "s1", startDate: "2026-11-02", lengthDays: 84, endedAt: null }, goals: seasonGoals } : null,
  capacity: async (userId) => saved.get(userId) ?? null,
  saveAvailable: async (userId, availableMinutes) => { saved.set(userId, { inputsHash: null, estimate: null, ...saved.get(userId), availableMinutes }); },
  cache: async (userId, inputsHash, estimate) => { saved.set(userId, { availableMinutes: null, ...saved.get(userId), inputsHash, estimate }); },
  patterns: async () => patterns,
});
const call = (method: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request("http://localhost/api/v1/coach/capacity", { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const read = async (user = "alice") => (await call("GET", { user })).json() as Promise<CapacityDto>;
const estimate = (fit: number, v2: number) => JSON.stringify({ goals: [{ ref: "g1", hoursPerWeek: fit, reason: "Three runs a week" }, { ref: "g2", hoursPerWeek: v2, reason: "Build evenings" }] });

describe("primary-goal capacity", () => {
  it("estimates only the active primary goals from their titles, targets and the season length", async () => {
    replies = [estimate(4, 6)];
    expect(await read()).toEqual({
      availableMinutes: null, neededMinutes: 600, over: false,
      goals: [{ goalId: "fit", minutesPerWeek: 240, reason: "Three runs a week" }, { goalId: "v2", minutesPerWeek: 360, reason: "Build evenings" }],
    });
    expect(JSON.parse(asked[0]!.at(-1)!.content)).toEqual({ seasonWeeks: 12, goals: [{ ref: "g1", title: "Run a marathon", target: "Finish in under 4 hours" }, { ref: "g2", title: "Ship v2", target: "Launch to customers" }] });
  });

  it("warns when the primary goals need more than the time available; saving the time asks no model again", async () => {
    replies = [estimate(4, 6)];
    await read();
    const put = await call("PUT", { cookie: "alice", origin: "http://localhost:5173", body: { availableMinutes: 480 } });
    expect(await put.json()).toMatchObject({ availableMinutes: 480, neededMinutes: 600, over: true });
    expect(await (await call("PUT", { user: "alice", body: { availableMinutes: 600 } })).json()).toMatchObject({ availableMinutes: 600, over: false });
    expect(asked).toHaveLength(1);
  });

  it("asks again only when the primary goals change", async () => {
    replies = [estimate(4, 6), estimate(4, 0.5)];
    await read();
    await read();
    expect(asked).toHaveLength(1);
    seasonGoals[1] = { ...seasonGoals[1]!, tier: "secondary" };
    replies = ['{"goals":[{"ref":"g1","hoursPerWeek":5,"reason":"More runs"}]}'];
    expect(await read()).toMatchObject({ neededMinutes: 300, goals: [{ goalId: "fit", minutesPerWeek: 300 }] });
    expect(asked).toHaveLength(2);
  });

  it("sends only the stored patterns (ticket 24); deleting one asks again", async () => {
    patterns = [{ id: "p1", statement: "Has two free evenings a week", evidence: "", source: "", learnedAt: new Date(), editedAt: null }];
    replies = [estimate(4, 6), estimate(4, 6)];
    await read();
    expect(asked[0]!.filter(message => message.role === "system").map(message => message.content).join("\n")).toContain("- Has two free evenings a week");
    await read();
    expect(asked).toHaveLength(1);
    patterns = [];
    await read();
    expect(asked).toHaveLength(2);
    expect(asked[1]!.some(message => message.content.includes("free evenings"))).toBe(false);
  });

  it("without a provider: only the user's own number, no model call", async () => {
    config = null;
    await call("PUT", { user: "alice", body: { availableMinutes: 300 } });
    expect(await read()).toEqual({ availableMinutes: 300, goals: null, neededMinutes: null, over: false });
    expect(asked).toEqual([]);
  });

  it("no season or no primary goal: nothing to estimate", async () => {
    expect(await read("bob")).toEqual({ availableMinutes: null, goals: null, neededMinutes: null, over: false });
    seasonGoals = seasonGoals.filter(item => item.tier === "secondary");
    expect((await read()).goals).toBeNull();
    expect(asked).toEqual([]);
  });

  it("a failing, incomplete or wild estimate shows none and is not cached", async () => {
    replies = [new CoachModelError("down"), '{"goals":[{"ref":"g1","hoursPerWeek":4,"reason":"x"}]}', estimate(4, 500), estimate(4, 6)];
    expect(await read()).toMatchObject({ goals: null, error: { code: "invalid", message: "down" } });
    for (let i = 0; i < 2; i++) expect((await read()).goals).toBeNull();
    expect((await read()).neededMinutes).toBe(600);
  });

  it("validates the time and guards writes", async () => {
    for (const body of [{ availableMinutes: -1 }, { availableMinutes: 20_000 }, { availableMinutes: 1.5 }, {}, { availableMinutes: 60, userId: "bob" }])
      expect((await call("PUT", { user: "alice", body })).status).toBe(400);
    expect((await call("PUT", { cookie: "alice", origin: "https://evil.example", body: { availableMinutes: 60 } })).status).toBe(403);
    expect((await call("GET")).status).toBe(401);
    expect(await (await call("PUT", { user: "alice", body: { availableMinutes: null } })).json()).toMatchObject({ availableMinutes: null });
  });
});
