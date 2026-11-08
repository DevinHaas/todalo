import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage, type CoachModelKind, type ConfiguredProvider } from "@todalo/server/coach";
import { CoachSecretError } from "@todalo/server/coach-secret";
import { createChatgptAuth, type ChatgptClient, type ChatgptTokens } from "@todalo/server/coach-chatgpt";
import { fakeOpenaiAuth } from "../../../packages/server/src/coach-chatgpt.fake";
import type { StatusInputs } from "@todalo/server/goal-status";
import type { SeasonGoalRecord } from "@todalo/server/season-dto";
import { createCoachRoutes, type CoachStore } from "./coach-routes";

type Saved = CoachConfig & { keyLast4: string | null; configuredAt: Date };
/** Saved configurations by "user kind" (ticket 17c: one per kind), and each user's pick. */
let providers: Map<string, Saved>;
let chosen: Map<string, CoachModelKind>;
/** Orders saves, so "most recently configured" is deterministic. */
let tick: number;
let cache: Map<string, { inputsHash: string; text: string }>;
let calls: { config: CoachConfig; messages: CoachMessage[]; schema?: string }[];
/** The fake model's canned reply; a function sees the facts sent. */
let reply: (facts: { goal?: string }) => string;
let secretReady: boolean;
let clock: Date;
/** Ticket 18: saved ChatGPT sign-ins and registrations, and the fake auth.openai.com the real sign-in code talks to. */
let chatgptRows: Map<string, { model: string; tokens: ChatgptTokens | null; at?: Date }>;
let clients: Map<string, ChatgptClient>;
let openai: ReturnType<typeof fakeOpenaiAuth>;
const tokens: ChatgptTokens = { clientId: "oaiapp_1", accessToken: "chatgpt-access-secret", refreshToken: "chatgpt-refresh-secret", email: "alice@example.com", expiresAt: new Date("2026-03-01T00:00:00Z"), earliestRefreshAt: null, scopes: [] };

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
  chosen = new Map();
  tick = 0;
  cache = new Map();
  calls = [];
  reply = (facts) => JSON.stringify({ explanation: `${facts.goal} explained.` });
  secretReady = true;
  reviewed = true;
  clock = new Date("2026-02-18T12:00:00Z");
  chatgptRows = new Map();
  clients = new Map();
  openai = fakeOpenaiAuth();
  store.chatgptAuth = createChatgptAuth(openai.fetch);
});

const keyed = (userId: string) => [...providers].filter(([key]) => key.startsWith(`${userId} `)).map(([, row]) => row);
/** The user's most recently saved configuration. */
const latest = (userId: string) => keyed(userId).sort((a, b) => b.configuredAt.getTime() - a.configuredAt.getTime())[0];

const store: CoachStore = {
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173", "https://app.todalo.dev"]),
  // Like the store: every saved configuration plus the ChatGPT sign-in (a row set by a test counts as the newest).
  state: async (userId) => {
    const row = chatgptRows.get(userId);
    const configured: ConfiguredProvider[] = keyed(userId).map(saved => ({ ...saved, usable: !saved.apiKey?.startsWith("undecryptable") }));
    if (row) configured.push({ provider: "chatgpt", model: row.model, baseUrl: null, apiKey: row.tokens?.accessToken ?? null, keyLast4: null, configuredAt: row.at ?? new Date(1e13), usable: Boolean(row.tokens) });
    return { configured, chatgpt: await store.chatgpt(userId), chosen: chosen.get(userId) ?? null };
  },
  setActive: async (userId, provider) => { chosen.set(userId, provider); },
  // The real sign-in code; only auth.openai.com is fake (replaced per test, below).
  chatgptAuth: createChatgptAuth(),
  chatgptClient: async (userId, key) => clients.get(`${userId} ${key}`) ?? null,
  saveChatgptClient: async (userId, key, client) => { clients.set(`${userId} ${key}`, client); },
  forgetChatgptClient: async (userId, key) => { clients.delete(`${userId} ${key}`); },
  chatgpt: async (userId) => {
    const row = chatgptRows.get(userId);
    return row ? { status: row.tokens ? "signed_in" : "expired", email: row.tokens?.email ?? null, model: row.model } : null;
  },
  saveChatgpt: async (userId, saved) => {
    if (!secretReady) throw new CoachSecretError("missing");
    chatgptRows.set(userId, { model: chatgptRows.get(userId)?.model ?? "gpt-5.5", tokens: saved, at: new Date(++tick) });
  },
  setChatgptModel: async (userId, model) => { chatgptRows.set(userId, { ...chatgptRows.get(userId)!, model }); },
  removeChatgpt: async (userId) => { chatgptRows.delete(userId); },
  save: async (userId, config) => {
    if (config.apiKey && !secretReady) throw new CoachSecretError("missing");
    providers.set(`${userId} ${config.provider}`, { ...config, keyLast4: config.apiKey?.slice(-4) ?? null, configuredAt: new Date(++tick) });
  },
  remove: async (userId, provider) => {
    for (const key of providers.keys()) if (key.startsWith(`${userId} `) && (!provider || key === `${userId} ${provider}`)) providers.delete(key);
    for (const key of cache.keys()) if (key.startsWith(`${userId}:`)) cache.delete(key);
  },
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
const off = { provider: null, selected: null, providers: [], chatgpt: null };

describe("coach provider settings", () => {
  it("starts unconnected, saves a key and returns only its last four characters", async () => {
    expect(await (await call("GET", "/coach", { user: "alice" })).json()).toEqual(off);
    const saved = await connect("alice", { provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-secret-key-9876" });
    expect(saved.status).toBe(200);
    const text = await saved.text();
    expect(text).not.toContain("sk-secret");
    const openai = { provider: "openai", model: "gpt-5.4-mini", baseUrl: null, keyHint: "9876" };
    expect(JSON.parse(text)).toEqual({ ...off, provider: openai, selected: "openai", providers: [openai] });
    const read = await call("GET", "/coach", { user: "alice" });
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.text()).not.toContain("sk-secret");
    expect(latest("alice")!.apiKey).toBe("sk-secret-key-9876");
    expect(await (await call("GET", "/coach", { user: "bob" })).json()).toEqual(off);
  });

  it("keeps the saved key when only the model changes, but a new provider needs its own key", async () => {
    await connect("alice", { provider: "openrouter", model: "a", apiKey: "sk-or-key-1111" });
    expect((await connect("alice", { provider: "openrouter", model: "b" })).status).toBe(200);
    expect(latest("alice")).toMatchObject({ model: "b", apiKey: "sk-or-key-1111" });
    const other = await connect("alice", { provider: "openai", model: "c" });
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual({ code: "INVALID_INPUT", message: "Enter an API key." });
    expect(latest("alice")!.provider).toBe("openrouter");
  });

  it("connects a loopback Ollama without a key and refuses any other host", async () => {
    const saved = await connect("alice", { provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434/", apiKey: "ignored-key" });
    const ollama = { provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434", keyHint: null };
    expect(await saved.json()).toEqual({ ...off, provider: ollama, selected: "ollama", providers: [ollama] });
    expect(latest("alice")!.apiKey).toBeNull();
    for (const baseUrl of ["http://10.0.0.2:11434", "https://evil.example", "http://169.254.169.254"]) {
      const refused = await connect("bob", { provider: "ollama", model: "m", baseUrl });
      expect(refused.status).toBe(400);
      expect((await refused.json() as { message: string }).message).toContain("localhost");
    }
    expect(latest("bob")).toBeUndefined();
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
    expect(latest("alice")).toBeUndefined();
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

describe("several providers and the active one (ticket 17c)", () => {
  type Dto = { provider: { provider: string; model: string } | null; selected: string | null; providers: { provider: string; keyHint: string | null }[] };
  const read = async (user = "alice") => (await call("GET", "/coach", { user })).json() as Promise<Dto>;
  const pick = (provider: string, user = "alice") => call("PUT", "/coach/active", { user, body: { provider } });
  const test = async (query = "") => (await call("POST", `/coach/provider/test${query}`, { user: "alice" })).json();

  beforeEach(async () => {
    await connect("alice", { provider: "openai", model: "gpt-5.4-mini", apiKey: "sk-openai-1111" });
    await connect("alice", { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-2222" });
  });

  it("keeps one configuration per kind and runs on the most recently configured until the user picks", async () => {
    const both = await read();
    expect(both.providers.map(item => [item.provider, item.keyHint])).toEqual([["openai", "1111"], ["anthropic", "2222"]]);
    expect(both).toMatchObject({ selected: "anthropic", provider: { provider: "anthropic" } });
    // A model change keeps that kind's own key, not the other's.
    await connect("alice", { provider: "openai", model: "gpt-5.5" });
    expect(providers.get("alice openai")).toMatchObject({ model: "gpt-5.5", apiKey: "sk-openai-1111" });
    expect((await read()).selected).toBe("openai");
  });

  it("uses the picked provider everywhere, and tests one card by ?provider=", async () => {
    expect(await (await pick("openai")).json()).toMatchObject({ selected: "openai", provider: { provider: "openai" } });
    await connect("alice", { provider: "openrouter", model: "x", apiKey: "sk-or-3333" });
    expect((await read()).selected).toBe("openai");
    await test();
    expect(calls.at(-1)!.config).toMatchObject({ provider: "openai", apiKey: "sk-openai-1111" });
    await call("GET", "/coach/explanations?timeZone=UTC", { user: "alice" });
    expect(calls.at(-1)!.config.provider).toBe("openai");
    expect(await test("?provider=anthropic")).toEqual({ ok: true });
    expect(calls.at(-1)!.config).toMatchObject({ provider: "anthropic", apiKey: "sk-ant-2222" });
    expect((await call("POST", "/coach/provider/test?provider=ollama", { user: "alice" })).status).toBe(404);
    expect((await call("POST", "/coach/provider/test?provider=gemini", { user: "alice" })).status).toBe(400);
  });

  it("only picks a configured provider, and guards the write", async () => {
    expect((await pick("ollama")).status).toBe(404);
    expect((await pick("chatgpt")).status).toBe(404);
    expect((await pick("gemini")).status).toBe(400);
    expect((await pick("openai", "bob")).status).toBe(404);
    expect((await call("PUT", "/coach/active", { cookie: "alice", origin: "https://evil.example", body: { provider: "openai" } })).status).toBe(403);
    expect(chosen.size).toBe(0);
  });

  it("disconnects one provider by ?provider=; the rest stay and the most recent takes over", async () => {
    await pick("anthropic");
    const after = await (await call("DELETE", "/coach/provider?provider=anthropic", { user: "alice" })).json() as Dto;
    expect(after).toMatchObject({ selected: "openai", provider: { provider: "openai" } });
    expect(after.providers.map(item => item.provider)).toEqual(["openai"]);
    expect((await call("DELETE", "/coach/provider?provider=chatgpt", { user: "alice" })).status).toBe(400);
    // Without ?provider= (ticket 17's single provider) every keyed one goes.
    expect(await (await call("DELETE", "/coach/provider", { user: "alice" })).json()).toEqual(off);
  });

  it("falls back when the picked one cannot run, and says what it was", async () => {
    chatgptRows.set("alice", { model: "gpt-5.5", tokens, at: new Date(0) });
    await pick("chatgpt");
    expect(await read()).toMatchObject({ selected: "chatgpt", provider: { provider: "chatgpt" } });
    // OpenAI refused a refresh: the most recent provider that can run takes over.
    chatgptRows.set("alice", { model: "gpt-5.5", tokens: null, at: new Date(0) });
    expect(await read()).toMatchObject({ selected: "chatgpt", provider: { provider: "anthropic" } });
    await test();
    expect(calls.at(-1)!.config.provider).toBe("anthropic");
    expect(await test("?provider=chatgpt")).toEqual({ ok: false, message: "ChatGPT signed you out. Sign in again." });
    // A key that no longer decrypts cannot run either.
    providers.set("alice anthropic", { ...providers.get("alice anthropic")!, apiKey: "undecryptable" });
    expect((await read()).provider!.provider).toBe("openai");
    // Nothing can run: the Coach is off, and Test connection says why.
    providers.set("alice openai", { ...providers.get("alice openai")!, apiKey: "undecryptable" });
    expect(await read()).toMatchObject({ selected: "chatgpt", provider: null });
    expect(await test()).toEqual({ ok: false, message: "ChatGPT signed you out. Sign in again." });
    expect(await (await call("GET", "/coach/explanations?timeZone=UTC", { user: "alice" })).json()).toEqual({ explanations: {} });
  });
});

describe("Anthropic by API key (ticket 17b)", () => {
  it("connects like any keyed provider, keeps the key on a model change and runs the Coach through the same seam", async () => {
    const saved = await connect("alice", { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-secret-4321" });
    expect(await saved.text()).not.toContain("sk-ant-secret");
    expect((await connect("alice", { provider: "anthropic", model: "claude-haiku-5-5" })).status).toBe(200);
    expect(latest("alice")).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", apiKey: "sk-ant-secret-4321" });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: true });
    expect(calls.at(-1)!.config).toMatchObject({ provider: "anthropic", apiKey: "sk-ant-secret-4321" });
  });
});

describe("ChatGPT sign-in (ticket 18)", () => {
  type Started = { authorizeUrl: string | null; mode?: string; message?: string };
  const start = async (init: Parameters<typeof call>[2] = { user: "alice", body: { port: 51234 } }) => (await call("POST", "/coach/chatgpt/start", init)).json() as Promise<Started>;
  const complete = async (callbackUrl: string, user = "alice") => (await call("POST", "/coach/chatgpt/complete", { user, body: { callbackUrl } })).json();
  const later = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000); };
  const params = (url: string) => new URL(url).searchParams;

  it("Mac: registers todalo on the first sign-in, completes through the loopback redirect and reuses the registration", async () => {
    const started = await start();
    expect(started.mode).toBe("loopback");
    const authorize = params(started.authorizeUrl!);
    expect(started.authorizeUrl!.startsWith("https://auth.openai.com/api/accounts/authorize?")).toBe(true);
    expect(Object.fromEntries(authorize)).toMatchObject({ client_id: "dynamic_agent_client", agent_name_hint: "todalo", redirect_uri: "http://127.0.0.1:51234/auth/callback", code_challenge_method: "S256" });
    expect(JSON.stringify(started)).not.toMatch(/verifier/);
    const back = openai.approve(started.authorizeUrl!);
    expect(await complete(back)).toEqual({ status: "signed_in" });
    expect(clients.get("alice http://127.0.0.1/auth/callback")).toEqual({ clientId: "oaiapp_1", email: "alice@example.com", sharing: true });
    const body = await (await call("GET", "/coach", { user: "alice" })).text();
    expect(body).not.toContain("access-for-");
    expect(body).not.toContain("refresh-");
    expect(JSON.parse(body)).toEqual({ ...off, provider: { provider: "chatgpt", model: "gpt-5.5", baseUrl: null, keyHint: null }, selected: "chatgpt", chatgpt: { status: "signed_in", email: "alice@example.com", model: "gpt-5.5" } });
    // The callback works once.
    expect(await complete(back)).toEqual({ status: "failed", message: "This sign-in is no longer active. Start again." });
    // Next time, on another port: the same client, no new registration.
    const again = params((await start({ user: "alice", body: { port: 60001 } })).authorizeUrl!);
    expect(Object.fromEntries(again)).toMatchObject({ client_id: "oaiapp_1", login_hint: "alice@example.com", redirect_uri: "http://127.0.0.1:60001/auth/callback" });
    expect(again.has("agent_name_hint")).toBe(false);
    expect(openai.clients.size).toBe(1);
  });

  it("web on localhost: OpenAI sends the browser to the API callback, which checks the state against the signed-in user", async () => {
    const started = await start({ cookie: "alice", origin: "http://localhost:5173" });
    expect(started.mode).toBe("callback");
    const back = new URL(openai.approve(started.authorizeUrl!));
    expect(back.origin + back.pathname).toBe("http://localhost:5173/api/v1/coach/chatgpt/callback");
    const visit = (cookie?: string) => app.handle(new Request(`http://localhost/api/v1/coach/chatgpt/callback${back.search}`, { headers: cookie ? { cookie: `session=${cookie}` } : {} }));
    const anonymous = await visit();
    expect(anonymous.status).toBe(400);
    expect(await anonymous.text()).toContain("Sign in to todalo in this browser");
    expect(await (await visit("bob")).text()).toContain("This sign-in is no longer active");
    const page = await visit("alice");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("ChatGPT is connected");
    expect(chatgptRows.get("alice")?.tokens?.clientId).toBe("oaiapp_1");
    expect(chatgptRows.has("bob")).toBe(false);
  });

  it("web elsewhere: OpenAI takes only loopback redirects, so the user pastes the address it sent the browser to", async () => {
    const started = await start({ cookie: "alice", origin: "https://app.todalo.dev" });
    expect(started.mode).toBe("paste");
    const redirect = new URL(params(started.authorizeUrl!).get("redirect_uri")!);
    expect(redirect.hostname).toBe("127.0.0.1");
    expect(Number(redirect.port)).toBeGreaterThanOrEqual(49_152);
    const back = openai.approve(started.authorizeUrl!);
    expect(await complete("  " + back.replace("http://", "") + " ")).toEqual({ status: "signed_in" });
  });

  it.each([
    ["another user's sign-in", (back: string) => complete(back, "bob"), "This sign-in is no longer active. Start again."],
    ["a made-up state", (back: string) => complete(back.replace(/state=[^&]+/, "state=forged")), "This sign-in is no longer active. Start again."],
    ["an address for another port", (back: string) => complete(back.replace(":51234", ":51235")), "That address does not belong to this sign-in. Start again."],
    ["an address that is not a URL", () => complete("http://"), "Paste the full address from your browser's address bar."],
    ["an expired sign-in", (back: string) => { later(11); return complete(back); }, "This sign-in is no longer active. Start again."],
  ])("refuses %s", async (_name, finish, message) => {
    const back = openai.approve((await start()).authorizeUrl!);
    expect(await finish(back)).toEqual({ status: "failed", message });
    expect(chatgptRows.size).toBe(0);
  });

  it("a started sign-in replaces the last one; another user's attempt does not end it", async () => {
    const first = openai.approve((await start()).authorizeUrl!);
    const second = openai.approve((await start()).authorizeUrl!);
    expect(await complete(first)).toMatchObject({ status: "failed" });
    expect(await complete(second, "bob")).toMatchObject({ status: "failed" });
    expect(await complete(second)).toEqual({ status: "signed_in" });
  });

  it("declined or not shared: no tokens, and the next sign-in asks for consent again", async () => {
    expect(await complete(openai.approve((await start()).authorizeUrl!, { decline: true }))).toEqual({ status: "failed", message: "You declined the sign-in at OpenAI. Sign in again when you are ready." });
    expect(await complete(openai.approve((await start()).authorizeUrl!, { share: false })))
      .toEqual({ status: "failed", message: "OpenAI did not share your ChatGPT plan. Sign in again and allow sharing of your ChatGPT plan." });
    expect(chatgptRows.size).toBe(0);
    expect(clients.get("alice http://127.0.0.1/auth/callback")?.sharing).toBe(false);
    expect(params((await start()).authorizeUrl!).get("prompt")).toBe("consent");
  });

  it("forgets a registration OpenAI no longer accepts, and needs COACH_SECRET_KEY", async () => {
    await complete(openai.approve((await start()).authorizeUrl!, { share: false }));
    const back = openai.approve((await start()).authorizeUrl!);
    openai.clients.delete("oaiapp_1");
    expect(await complete(back)).toEqual({ status: "failed", message: "OpenAI no longer accepts todalo's registration. Sign in again." });
    expect(clients.size).toBe(0);
    expect(params((await start()).authorizeUrl!).get("client_id")).toBe("dynamic_agent_client");
    secretReady = false;
    expect(await complete(openai.approve((await start()).authorizeUrl!))).toEqual({ status: "failed", message: "This server cannot store API keys yet (COACH_SECRET_KEY is missing)." });
  });

  it("says so when OpenAI cannot be reached", async () => {
    openai.down = true;
    expect(await start()).toEqual({ authorizeUrl: null, message: "Could not reach OpenAI. Try again." });
  });

  it("runs the Coach on ChatGPT while signed in, then falls back to the saved key after sign-out or expiry", async () => {
    await connect("alice", { provider: "openai", model: "m", apiKey: "sk-12345678" });
    chatgptRows.set("alice", { model: "gpt-5.5", tokens });
    expect(await (await call("POST", "/coach/provider/test", { user: "alice" })).json()).toEqual({ ok: true });
    expect(calls.at(-1)!.config).toMatchObject({ provider: "chatgpt", apiKey: "chatgpt-access-secret" });
    // A model change for ChatGPT leaves the key provider alone.
    const changed = await call("PUT", "/coach/chatgpt", { user: "alice", body: { model: "gpt-6-sol" } });
    expect((await changed.json() as { provider: { model: string } }).provider.model).toBe("gpt-6-sol");
    expect(latest("alice")!.model).toBe("m");
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

  it("guards its writes", async () => {
    expect((await call("POST", "/coach/chatgpt/start", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/coach/chatgpt/complete", { cookie: "alice", origin: "https://evil.example", body: { callbackUrl: "x" } })).status).toBe(403);
    expect((await call("DELETE", "/coach/chatgpt", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/coach/chatgpt/start", { user: "alice", body: { port: 80 } })).status).toBe(400);
    expect((await call("POST", "/coach/chatgpt/complete", { user: "alice", body: {} })).status).toBe(400);
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
