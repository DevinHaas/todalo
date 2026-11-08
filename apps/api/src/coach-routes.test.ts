import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import { CoachSecretError } from "@todalo/server/coach-secret";
import { ChatgptRefusedError, type ChatgptTokens } from "@todalo/server/coach-chatgpt";
import type { StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord } from "@todalo/server/season-dto";
import { createCoachRoutes, type CoachStore } from "./coach-routes";

type Saved = CoachConfig & { keyLast4: string | null };
let providers: Map<string, Saved>;
let cache: Map<string, { inputsHash: string; text: string }>;
let calls: { config: CoachConfig; messages: CoachMessage[]; schema?: string }[];
/** The fake model's canned reply; a function sees the facts sent. */
let reply: (facts: { goal?: string }) => string;
let secretReady: boolean;
let clock: Date;
/** Ticket 18: saved ChatGPT sign-ins, and what the fake OpenAI does on the next poll. */
let chatgptRows: Map<string, { model: string; tokens: ChatgptTokens | null }>;
let openai: "waiting" | "approved" | "refused" | "down";
let polls: number;
const tokens: ChatgptTokens = { accessToken: "chatgpt-access-secret", refreshToken: "chatgpt-refresh-secret", accountId: "acct-1", email: "alice@example.com", expiresAt: new Date("2026-03-01T00:00:00Z") };

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
  chatgptRows = new Map();
  openai = "waiting";
  polls = 0;
});

const keyed = (userId: string) => providers.get(userId) ?? null;

const store: CoachStore = {
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  // Like the store: ChatGPT while signed in, else the saved key.
  provider: async (userId) => {
    const signedIn = chatgptRows.get(userId);
    return signedIn?.tokens ? { provider: "chatgpt", model: signedIn.model, baseUrl: null, apiKey: signedIn.tokens.accessToken, accountId: signedIn.tokens.accountId, keyLast4: null } : keyed(userId);
  },
  keyProvider: async (userId) => keyed(userId),
  chatgptAuth: {
    start: async () => ({ deviceAuthId: "device-secret", userCode: "ABCD-1234", intervalSeconds: 5 }),
    poll: async (code) => {
      polls++;
      expect(code.deviceAuthId).toBe("device-secret");
      if (openai === "down") throw new CoachModelError("Could not reach OpenAI.");
      if (openai === "refused") throw new ChatgptRefusedError("OpenAI ended the sign-in. Start again.");
      return openai === "approved" ? tokens : null;
    },
    refresh: async () => tokens,
  },
  chatgpt: async (userId) => {
    const row = chatgptRows.get(userId);
    return row ? { status: row.tokens ? "signed_in" : "expired", email: row.tokens?.email ?? null, model: row.model } : null;
  },
  saveChatgpt: async (userId, saved) => {
    if (!secretReady) throw new CoachSecretError("missing");
    chatgptRows.set(userId, { model: chatgptRows.get(userId)?.model ?? "gpt-5.5", tokens: saved });
  },
  setChatgptModel: async (userId, model) => { chatgptRows.set(userId, { ...chatgptRows.get(userId)!, model }); },
  removeChatgpt: async (userId) => { chatgptRows.delete(userId); },
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
};
const app = createCoachRoutes(store);

const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const connect = (user: string, body: unknown) => call("PUT", "/coach/provider", { user, body });
/** GET /coach for a user with nothing connected. */
const off = { provider: null, keyProvider: null, chatgpt: null, chatgptAvailable: true };

describe("coach provider settings", () => {
  it("starts unconnected, saves a key and returns only its last four characters", async () => {
    expect(await (await call("GET", "/coach", { user: "alice" })).json()).toEqual(off);
    const saved = await connect("alice", { provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-secret-key-9876" });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain("sk-secret");
    const openai = { provider: "openai", model: "gpt-5.4-mini", baseUrl: null, keyHint: "9876" };
    expect(JSON.parse(text)).toEqual({ ...off, provider: openai, keyProvider: openai });
    const read = await call("GET", "/coach", { user: "alice" });
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.text()).not.toContain("sk-secret");
    expect(providers.get("alice")!.apiKey).toBe("sk-secret-key-9876");
    expect(await (await call("GET", "/coach", { user: "bob" })).json()).toEqual(off);
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
    const ollama = { provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434", keyHint: null };
    expect(await saved.json()).toEqual({ ...off, provider: ollama, keyProvider: ollama });
    expect(providers.get("alice")!.apiKey).toBeNull();
    for (const baseUrl of ["http://10.0.0.2:11434", "https://evil.example", "http://169.254.169.254"]) {
      const refused = await connect("bob", { provider: "ollama", model: "m", baseUrl });
      expect(refused.status).toBe(400);
      expect((await refused.json() as { message: string }).message).toContain("localhost");
    }
    expect(providers.has("bob")).toBe(false);
  });

  it("rejects bad bodies and reports a server that cannot encrypt keys", async () => {
    for (const body of [{}, { provider: "gemini-cli", model: "x", apiKey: "sk-12345678" }, { provider: "chatgpt", model: "x", apiKey: "sk-12345678" }, { provider: "openai", model: "", apiKey: "sk-12345678" }, { provider: "openai", model: "m", apiKey: "sk-12345678", userId: "bob" }]) {
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
    expect(await (await call("DELETE", "/coach/provider", { user: "alice" })).json()).toEqual(off);
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

describe("Anthropic by API key (ticket 17b)", () => {
  it("connects like any keyed provider, keeps the key on a model change and runs the Coach through the same seam", async () => {
    const saved = await connect("alice", { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-secret-4321" });
    expect(await saved.text()).not.toContain("sk-ant-secret");
    expect((await connect("alice", { provider: "anthropic", model: "claude-haiku-5-5" })).status).toBe(200);
    expect(providers.get("alice")).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-ant-secret-4321" });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: true });
    expect(calls.at(-1)!.config).toMatchObject({ provider: "anthropic", apiKey: "sk-ant-secret-4321" });
  });
});

describe("ChatGPT sign-in (ticket 18)", () => {
  const start = (user = "alice") => call("POST", "/coach/chatgpt/start", { user });
  const poll = async (user = "alice") => (await call("POST", "/coach/chatgpt/poll", { user })).json();
  const later = (seconds: number) => { clock = new Date(clock.getTime() + seconds * 1000); };

  it("shows a code to enter at OpenAI, polls at OpenAI's interval and signs in once approved", async () => {
    const started = await start();
    const text = await started.text();
    expect(text).not.toContain("device-secret");
    expect(JSON.parse(text)).toEqual({ signIn: { userCode: "ABCD-1234", verificationUrl: "https://auth.openai.com/codex/device", intervalSeconds: 5 } });
    expect(await poll()).toEqual({ status: "pending" });
    expect(polls).toBe(0);
    later(5);
    expect(await poll()).toEqual({ status: "pending" });
    expect(polls).toBe(1);
    openai = "approved";
    later(1);
    expect(await poll()).toEqual({ status: "pending" });
    later(5);
    expect(await poll()).toEqual({ status: "signed_in" });
    const coach = await call("GET", "/coach", { user: "alice" });
    const body = await coach.text();
    expect(body).not.toContain("chatgpt-access-secret");
    expect(body).not.toContain("chatgpt-refresh-secret");
    expect(JSON.parse(body)).toEqual({ ...off, provider: { provider: "chatgpt", model: "gpt-5.5", baseUrl: null, keyHint: null }, chatgpt: { status: "signed_in", email: "alice@example.com", model: "gpt-5.5" } });
    expect(await poll()).toEqual({ status: "failed", message: "Start the sign-in again." });
  });

  it("runs the Coach on ChatGPT while signed in, then falls back to the saved key after sign-out or expiry", async () => {
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    chatgptRows.set("alice", { model: "gpt-5.5", tokens });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: true });
    expect(calls.at(-1)!.config).toMatchObject({ provider: "chatgpt", apiKey: "chatgpt-access-secret", accountId: "acct-1" });
    // A model change for ChatGPT leaves the key provider alone.
    const changed = await call("PUT", "/coach/chatgpt", { user: "alice", body: { model: "gpt-6-sol" } });
    expect((await changed.json() as { provider: { model: string } }).provider.model).toBe("gpt-6-sol");
    expect(providers.get("alice")!.model).toBe("m");
    // Expired (OpenAI refused a refresh): settings say so, the Coach uses the key.
    chatgptRows.set("alice", { model: "gpt-6-sol", tokens: null });
    const expired = await (await call("GET", "/coach", { user: "alice" })).json() as { provider: { provider: string }; chatgpt: { status: string } };
    expect(expired.provider.provider).toBe("openai");
    expect(expired.chatgpt.status).toBe("expired");
    chatgptRows.set("alice", { model: "gpt-6-sol", tokens });
    const signedOut = await call("DELETE", "/coach/chatgpt", { user: "alice" });
    expect(await signedOut.json()).toMatchObject({ provider: { provider: "openai", model: "m" }, chatgpt: null });
    await call("POST", "/coach/provider/test", { user: "alice" });
    expect(calls.at(-1)!.config.provider).toBe("openai");
  });

  it("ends a refused or expired sign-in, keeps waiting through an outage and needs COACH_SECRET_KEY", async () => {
    await start();
    later(5);
    openai = "down";
    expect(await poll()).toEqual({ status: "pending", message: "Could not reach OpenAI." });
    later(5);
    openai = "refused";
    expect(await poll()).toEqual({ status: "failed", message: "OpenAI ended the sign-in. Start again." });
    await start();
    later(16 * 60);
    expect(await poll()).toEqual({ status: "failed", message: "The code expired. Start the sign-in again." });
    await start();
    later(5);
    openai = "approved";
    secretReady = false;
    expect(await poll()).toEqual({ status: "failed", message: "This server cannot store API keys yet (COACH_SECRET_KEY is missing)." });
    expect(chatgptRows.size).toBe(0);
  });

  it("is not offered without an OAuth client, and guards its writes", async () => {
    const plain = createCoachRoutes({ ...store, chatgptAuth: null });
    const headers = { authorization: "Bearer alice" };
    expect(await (await plain.handle(new Request("http://localhost/api/v1/coach", { headers }))).json()).toEqual({ ...off, chatgptAvailable: false });
    expect(await (await plain.handle(new Request("http://localhost/api/v1/coach/chatgpt/start", { method: "POST", headers }))).json())
      .toEqual({ signIn: null, message: "This server does not offer ChatGPT sign-in yet. Use an API key instead." });
    expect((await call("POST", "/coach/chatgpt/start", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("DELETE", "/coach/chatgpt", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("PUT", "/coach/chatgpt", { user: "alice", body: { model: "m" } })).status).toBe(404);
    expect((await call("PUT", "/coach/chatgpt", { user: "alice", body: { model: "" } })).status).toBe(400);
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
