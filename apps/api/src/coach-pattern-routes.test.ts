import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { CoachPatternsDto, PatternRecord } from "@todalo/server/coach-patterns";
import type { StatusInputs } from "@todalo/server/goal-status";
import { createCoachPatternRoutes } from "./coach-pattern-routes";

let clock: Date;
let providers: Map<string, CoachConfig>;
let rows: (PatternRecord & { userId: string })[];
let calls: { messages: CoachMessage[]; schema?: string }[];
let reply: () => string;
let statusInputs: StatusInputs;

// Season from Mon 2 Feb 2026; today Wed 18 Feb (week 3).
const task = (id: string, due: string, done: boolean) =>
  ({ id, projectId: null, status: done ? "done" as const : "todo" as const, dueDate: new Date(due), dueDateEnd: new Date(new Date(due).getTime() + 3_600_000), completedAt: done ? new Date(due) : null });
const busy = (): StatusInputs => {
  const tasks = [task("a", "2026-02-03T08:00:00Z", true), task("b", "2026-02-04T08:00:00Z", true), task("c", "2026-02-10T08:00:00Z", true), task("d", "2026-02-11T15:00:00Z", false)];
  return { links: { projects: [], tasks: tasks.map(item => ({ goalId: "fit", taskId: item.id })) }, tasks, ratings: [{ goalId: "fit", day: "2026-02-08", rating: "solid" }], milestones: [], reviewed: true };
};
const learned = (...patterns: { statement: string; evidence: string }[]) => JSON.stringify({ patterns });

beforeEach(() => {
  clock = new Date("2026-02-18T12:00:00Z");
  providers = new Map([["alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" }]]);
  rows = [];
  calls = [];
  statusInputs = busy();
  reply = () => learned({ statement: "Ships best in the mornings", evidence: "3 of 3 goal tasks were done before noon; afternoon time kept 0 of 60 minutes." });
});

const app = createCoachPatternRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async (userId) => providers.get(userId) ?? null,
  // In-memory fake provider; it never reaches a network.
  model: (config) => ({
    complete: async ({ messages, schema }) => {
      calls.push({ messages, schema: schema?.name });
      if (config.model === "broken") throw new CoachModelError("The provider is unavailable. Try again later.");
      return reply();
    },
  }),
  season: async (userId) => userId === "alice" ? {
    season: { id: "s1", startDate: "2026-02-02", lengthDays: 84, endedAt: null },
    goals: [{ id: "sg1", goalId: "fit", title: "Become fit", color: "green", archivedAt: null, tier: "primary", target: "Run 5k", carriedFromId: null }],
  } : null,
  statusInputs: async () => statusInputs,
  moves: async () => [],
  patterns: async (userId) => rows.filter(row => row.userId === userId),
  add: async (userId, patterns, at) => { patterns.forEach((pattern, index) => rows.push({ ...pattern, userId, id: `p${rows.length + 1}`, learnedAt: new Date(at.getTime() + index), editedAt: null })); },
  update: async (userId, id, statement, at) => {
    const row = rows.find(item => item.userId === userId && item.id === id);
    if (row) Object.assign(row, { statement, editedAt: at });
    return Boolean(row);
  },
  remove: async (userId, id) => {
    const before = rows.length;
    rows = rows.filter(item => !(item.userId === userId && item.id === id));
    return rows.length < before;
  },
  now: () => clock,
});

const call = async (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const learn = async (user = "alice") => (await call("POST", "/coach/patterns/learn?timeZone=UTC", { user })).json() as Promise<CoachPatternsDto>;
const list = async (user = "alice") => (await (await call("GET", "/coach/patterns", { user })).json() as CoachPatternsDto).patterns;

describe("coach patterns", () => {
  it("learns patterns with their evidence and source from the season's goal work only", async () => {
    const result = await learn();
    expect(result.learned).toBe(1);
    expect(result.patterns).toEqual([{
      id: "p1", statement: "Ships best in the mornings", evidence: "3 of 3 goal tasks were done before noon; afternoon time kept 0 of 60 minutes.",
      source: "Season from 2 Feb, weeks 1–3: goal tasks done, scheduled and moved, and progress ratings", learnedAt: clock.toISOString(), editedAt: null,
    }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.schema).toBe("coach_patterns");
    const facts = JSON.parse(calls[0]!.messages.at(-1)!.content);
    expect(Object.keys(facts).sort()).toEqual(["goals", "known", "seasonWeek"]);
    expect(facts.goals[0]).toMatchObject({ goal: "Become fit", tier: "primary", doneAt: [{ partOfDay: "morning", tasks: 3 }] });
    expect(JSON.stringify(facts)).not.toContain("Run 5k");
  });

  it("sends the patterns it keeps as known and adds none it already has", async () => {
    await learn();
    const again = await learn();
    expect(JSON.parse(calls[1]!.messages.at(-1)!.content).known).toEqual(["Ships best in the mornings"]);
    expect(again).toMatchObject({ learned: 0, message: "The Coach found nothing new it is sure about." });
    expect(again.patterns).toHaveLength(1);
  });

  it("calls no model without a provider, a season or enough goal work, and says why", async () => {
    expect((await call("POST", "/coach/patterns/learn", { user: "bob" })).status).toBe(404);
    providers.set("bob", { provider: "ollama", model: "m", baseUrl: null, apiKey: null });
    expect(await learn("bob")).toMatchObject({ learned: 0, message: expect.stringContaining("Start a season") });
    statusInputs = { links: { projects: [], tasks: [] }, tasks: [], ratings: [], milestones: [], reviewed: true };
    expect(await learn()).toMatchObject({ learned: 0, message: expect.stringContaining("Not enough to learn from") });
    expect(calls).toEqual([]);
  });

  it("stores nothing when the model fails or answers malformed", async () => {
    providers.set("alice", { provider: "openrouter", model: "broken", baseUrl: null, apiKey: "sk-or-test" });
    expect(await learn()).toMatchObject({ patterns: [], learned: 0, message: "The provider is unavailable. Try again later." });
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" });
    reply = () => "nope";
    expect(await learn()).toMatchObject({ patterns: [], learned: 0, message: "The Coach's patterns were not valid JSON." });
    expect(rows).toEqual([]);
  });

  it("lets the user edit and delete any pattern, without a provider, and only their own", async () => {
    await learn();
    providers.clear();
    const edited = await call("PATCH", "/coach/patterns/p1", { user: "alice", body: { statement: "  Ships best before lunch " } });
    expect((await edited.json() as CoachPatternsDto).patterns[0]).toMatchObject({ statement: "Ships best before lunch", editedAt: clock.toISOString() });
    expect((await call("PATCH", "/coach/patterns/p1", { user: "bob", body: { statement: "Mine" } })).status).toBe(404);
    expect((await call("PATCH", "/coach/patterns/p1", { user: "alice", body: { statement: " " } })).status).toBe(400);
    expect((await call("PATCH", "/coach/patterns/p1", { user: "alice", body: { statement: "x", evidence: "y" } })).status).toBe(400);
    expect((await call("DELETE", "/coach/patterns/p1", { user: "bob" })).status).toBe(404);
    expect(await list("bob")).toEqual([]);
    expect((await (await call("DELETE", "/coach/patterns/p1", { user: "alice" })).json() as CoachPatternsDto).patterns).toEqual([]);
    expect((await call("DELETE", "/coach/patterns/p1", { user: "alice" })).status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("guards: 401 without a session, 403 for cookie writes from another origin", async () => {
    expect((await call("GET", "/coach/patterns")).status).toBe(401);
    expect((await call("POST", "/coach/patterns/learn", { origin: "http://localhost:5173" })).status).toBe(401);
    expect((await call("POST", "/coach/patterns/learn", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("DELETE", "/coach/patterns/p1", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/coach/patterns/learn", { cookie: "alice", origin: "http://localhost:5173" })).status).toBe(200);
  });
});
