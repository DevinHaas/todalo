import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import { CoachSecretError } from "@todalo/server/coach-secret";
import type { StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord } from "@todalo/server/season-dto";
import { createCoachRoutes } from "./coach-routes";

type Saved = CoachConfig & { keyLast4: string | null };
let providers: Map<string, Saved>;
let cache: Map<string, { inputsHash: string; text: string }>;
let calls: { config: CoachConfig; messages: CoachMessage[]; schema?: string }[];
/** The fake model's canned reply; a function sees the facts sent. */
let reply: (facts: { goal?: string }) => string;
let secretReady: boolean;
let clock: Date;

const goal = (goalId: string, title: string, archived = false): SeasonGoalRecord =>
  ({ id: `sg-${goalId}`, goalId, title, color: "blue", archivedAt: archived ? new Date() : null, tier: "primary", target: `${title} target`, carriedFromId: null });
const done = (id: string, at: string) => ({ id, projectId: null, status: "done" as const, dueDate: null, dueDateEnd: null, completedAt: new Date(at) });
const inputs = (reviewed: boolean): StatusInputs => ({
  links: { projects: [], tasks: ["a", "b", "c"].map(taskId => ({ goalId: "fit", taskId })) },
  tasks: [done("a", "2026-02-02T09:00:00Z"), done("b", "2026-02-03T09:00:00Z"), done("c", "2026-02-10T09:00:00Z")],
  ratings: [{ goalId: "fit", day: "2026-02-02", rating: "solid" }], milestones: [], reviewed,
});
let reviewed: boolean;

beforeEach(() => {
  providers = new Map();
  cache = new Map();
  calls = [];
  reply = (facts) => JSON.stringify({ explanation: `${facts.goal} explained.` });
  secretReady = true;
  reviewed = true;
  clock = new Date("2026-02-18T12:00:00Z");
});

const app = createCoachRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async (userId) => providers.get(userId) ?? null,
  save: async (userId, config) => {
    if (config.apiKey && !secretReady) throw new CoachSecretError("missing");
    providers.set(userId, { ...config, keyLast4: config.apiKey?.slice(-4) ?? null });
  },
  remove: async (userId) => { providers.delete(userId); for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key); },
  // In-memory fake provider with canned output; it never reaches a network.
  model: (config) => ({
    complete: async ({ messages, schema }) => {
      calls.push({ config, messages, schema: schema?.name });
      if (config.model === "broken") throw new CoachModelError("The provider rejected the API key.");
      if (schema?.name === "ping") return config.model === "no-json" ? "pong" : '{"ok":true}';
      return reply(JSON.parse(messages.at(-1)!.content));
    },
  }),
  // Alice's season started 1 Feb (84 days); on 18 Feb it is day 18. Bob has no season.
  season: async (userId) => userId === "alice"
    ? { season: { id: "s1", startDate: "2026-02-01", lengthDays: 84, endedAt: null }, goals: [goal("fit", "Become fit"), goal("ship", "Ship v2"), goal("old", "Old", true)] }
    : null,
  statusInputs: async (userId) => userId === "alice" ? inputs(reviewed) : inputs(false),
  cached: async (userId) => [...cache].filter(([key]) => key.startsWith(`${userId}:`)).map(([key, row]) => ({ goalId: key.split(":")[1]!, ...row })),
  cache: async (userId, goalId, inputsHash, text) => { cache.set(`${userId}:${goalId}`, { inputsHash, text }); },
  now: () => clock,
});

const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const connect = (user: string, body: unknown) => call("PUT", "/coach/provider", { user, body });

describe("coach provider settings", () => {
  it("starts unconnected, saves a key and returns only its last four characters", async () => {
    expect(await (await call("GET", "/coach", { user: "alice" })).json()).toEqual({ provider: null });
    const saved = await connect("alice", { provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-secret-key-9876" });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain("sk-secret");
    expect(JSON.parse(text)).toEqual({ provider: { provider: "openai", model: "gpt-5.4-mini", baseUrl: null, keyHint: "9876" } });
    const read = await call("GET", "/coach", { user: "alice" });
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.text()).not.toContain("sk-secret");
    expect(providers.get("alice")!.apiKey).toBe("sk-secret-key-9876");
    expect(await (await call("GET", "/coach", { user: "bob" })).json()).toEqual({ provider: null });
  });

  it("keeps the saved key when only the model changes, but a new provider needs its own key", async () => {
    await connect("alice", { provider: "openrouter", model: "a", apiKey: "sk-or-key-1111" });
    expect((await connect("alice", { provider: "openrouter", model: "b" })).status).toBe(200);
    expect(providers.get("alice")).toMatchObject({ model: "b", apiKey: "sk-or-key-1111" });
    const other = await connect("alice", { provider: "openai", model: "c" });
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual({ code: "INVALID_INPUT", message: "Enter an API key." });
    expect(providers.get("alice")!.provider).toBe("openrouter");
  });

  it("connects a loopback Ollama without a key and refuses any other host", async () => {
    const saved = await connect("alice", { provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434/", apiKey: "ignored-key" });
    expect(await saved.json()).toEqual({ provider: { provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434", keyHint: null } });
    expect(providers.get("alice")!.apiKey).toBeNull();
    for (const baseUrl of ["http://10.0.0.2:11434", "https://evil.example", "http://169.254.169.254"]) {
      const refused = await connect("bob", { provider: "ollama", model: "m", baseUrl });
      expect(refused.status).toBe(400);
      expect((await refused.json() as { message: string }).message).toContain("localhost");
    }
    expect(providers.has("bob")).toBe(false);
  });

  it("rejects bad bodies and reports a server that cannot encrypt keys", async () => {
    for (const body of [{}, { provider: "anthropic", model: "x", apiKey: "sk-12345678" }, { provider: "openai", model: "", apiKey: "sk-12345678" }, { provider: "openai", model: "m", apiKey: "sk-12345678", userId: "bob" }]) {
      expect((await connect("alice", body)).status).toBe(400);
    }
    secretReady = false;
    const response = await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    expect(response.status).toBe(503);
    expect((await response.json() as { code: string }).code).toBe("COACH_NOT_CONFIGURED");
    expect(providers.size).toBe(0);
  });

  it("disconnects: the key and cached explanations go", async () => {
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    await call("GET", "/coach/explanations", { user: "alice" });
    expect(cache.size).toBeGreaterThan(0);
    expect(await (await call("DELETE", "/coach/provider", { user: "alice" })).json()).toEqual({ provider: null });
    expect(providers.has("alice")).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("tests the saved connection with a structured ping and explains failures", async () => {
    expect((await call("POST", "/coach/provider/test", { user: "alice" })).status).toBe(404);
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: true });
    expect(calls.at(-1)).toMatchObject({ schema: "ping", config: { apiKey: "sk-12345678" } });
    await connect("alice", { provider: "openai", model: "no-json" });
    const noJson = await call("POST", "/coach/provider/test", { user: "alice" });
    expect(noJson.status).toBe(200);
    expect(await noJson.json()).toEqual({ ok: false, message: "The model answered, but not with the JSON the Coach needs. Try another model." });
    await connect("alice", { provider: "openai", model: "broken" });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: false, message: "The provider rejected the API key." });
  });

  it("guards writes: 401 without a session, 403 for cookie writes from another origin", async () => {
    expect((await call("GET", "/coach")).status).toBe(401);
    expect((await call("GET", "/coach/explanations")).status).toBe(401);
    const body = { provider: "openai", model: "m", apiKey: "sk-12345678" };
    expect((await call("PUT", "/coach/provider", { cookie: "alice", origin: "https://evil.example", body })).status).toBe(403);
    expect((await call("DELETE", "/coach/provider", { cookie: "alice" })).status).toBe(403);
    expect((await call("POST", "/coach/provider/test", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect(providers.size).toBe(0);
    expect((await call("PUT", "/coach/provider", { cookie: "alice", origin: "http://localhost:5173", body })).status).toBe(200);
  });
});

describe("goal status explanations", () => {
  const explanations = async (user = "alice") => (await (await call("GET", "/coach/explanations?timeZone=UTC", { user })).json() as { explanations: Record<string, string> }).explanations;

  it("is empty and calls no model without a provider or a season", async () => {
    expect(await explanations()).toEqual({});
    await connect("bob", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    expect(await explanations("bob")).toEqual({});
    expect(calls).toEqual([]);
  });

  it("explains each active season goal from its computed facts only", async () => {
    await connect("alice", { provider: "openrouter", model: "m", apiKey: "sk-12345678" });
    expect(await explanations()).toEqual({ fit: "Become fit explained.", ship: "Ship v2 explained." });
    expect(calls).toHaveLength(2);
    const facts = JSON.parse(calls.find(item => item.messages.at(-1)!.content.includes("Become fit"))!.messages.at(-1)!.content);
    expect(facts).toMatchObject({ goal: "Become fit", seasonDay: 18, seasonLength: 84, weeks: [{ week: 1, goalTasksCompleted: 2, progressRatings: ["Solid"] }, { week: 2, goalTasksCompleted: 1 }, { week: 3, inProgress: true }] });
    expect(Object.keys(facts).sort()).toEqual(["goal", "projectedAtSeasonEnd", "score", "seasonDay", "seasonLength", "status", "target", "tier", "weeks"]);
    expect(calls.every(item => item.schema === "goal_status_explanation")).toBe(true);
  });

  it("reuses the cached explanation on reload and asks again when the day, inputs or model change", async () => {
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    await explanations();
    await explanations();
    expect(calls).toHaveLength(2);
    clock = new Date("2026-02-19T12:00:00Z");
    reply = () => JSON.stringify({ explanation: "A new day." });
    expect((await explanations()).fit).toBe("A new day.");
    expect(calls).toHaveLength(4);
    await connect("alice", { provider: "openai", model: "other" });
    await explanations();
    expect(calls).toHaveLength(6);
  });

  it("says nothing while every goal is Too early", async () => {
    reviewed = false;
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    expect(await explanations()).toEqual({});
    expect(calls).toEqual([]);
  });

  it("drops only a failed or malformed explanation and caches none of it", async () => {
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    reply = (facts) => facts.goal === "Ship v2" ? "not json" : JSON.stringify({ explanation: "Fine." });
    expect(await explanations()).toEqual({ fit: "Fine." });
    expect([...cache.keys()]).toEqual(["alice:fit"]);
    await connect("alice", { provider: "openai", model: "broken" });
    const response = await call("GET", "/coach/explanations", { user: "alice" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ explanations: {} });
  });
});
