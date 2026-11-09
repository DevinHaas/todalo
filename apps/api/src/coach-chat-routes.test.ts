import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { ChatMessageRecord, CoachChatDto } from "@todalo/server/coach-chat";
import type { DraftRecord, DraftTask, NewDraft } from "@todalo/server/drafts";
import { createCoachChatRoutes } from "./coach-chat-routes";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
let clock: Date;
const v1 = new Date("2026-02-01T00:00:00Z");
let providers: Map<string, CoachConfig>;
let tasks: (DraftTask & { userId: string })[];
let stored: (ChatMessageRecord & { userId: string })[];
let drafts: (NewDraft & { id: string; userId: string })[];
let calls: { messages: CoachMessage[]; schema?: string }[];
type Facts = { goals: { ref: string; title: string; target: string; status: string }[]; scheduled: { ref: string; title: string }[]; toPlan: { ref: string; title: string }[]; days: { day: string }[] };
/** The fake model's reply; it sees the facts it was sent. */
let reply: (facts: Facts, messages: CoachMessage[]) => string;

const task = (userId: string, id: string, extra: Partial<DraftTask> = {}) =>
  tasks.push({ userId, id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: v1, ...extra });
const answer = (text: string, items: Record<string, unknown>[] = [], summary = "") => JSON.stringify({ reply: text, summary, items });
const item = (op: string, extra: Record<string, unknown>) => ({ op, task: "", title: "", day: "", start: "", minutes: 0, goal: "", reason: "Fits.", ...extra });
const ref = (entries: { ref: string; title: string }[], title: string) => entries.find(entry => entry.title === title)!.ref;

beforeEach(() => {
  clock = new Date("2026-02-09T08:10:00Z");
  providers = new Map([["alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" }]]);
  tasks = [];
  stored = [];
  drafts = [];
  calls = [];
  task("alice", "run-id", { title: "Run" });
  task("alice", "meeting-id", { title: "Meeting", dueDate: new Date("2026-02-09T09:00:00Z"), dueDateEnd: new Date("2026-02-09T10:00:00Z") });
  task("bob", "bobs-id", { title: "Bob's task" });
  reply = () => answer("Your run fits best this morning.");
});

const snapshot = () => JSON.stringify(tasks);

const app = createCoachChatRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async (userId) => providers.get(userId) ?? null,
  // In-memory fake provider; it never reaches a network.
  model: (config) => ({
    complete: async ({ messages, schema }) => {
      calls.push({ messages, schema: schema?.name });
      if (config.model === "broken") throw new CoachModelError("The provider is unavailable. Try again later.", "overloaded");
      return reply(JSON.parse(messages[1]!.content.replace(/^Facts: /, "")), messages);
    },
  }),
  dayContext: async (userId) => ({
    tasks: tasks.filter(row => row.userId === userId),
    goals: userId === "alice" ? [{ goalId: "fit", title: "Become fit", tier: "primary" }] : [],
    links: { projects: [], tasks: [{ goalId: "fit", taskId: "run-id" }] },
    fixedTaskIds: [],
  }),
  season: async (userId) => userId === "alice" ? {
    season: { id: "s1", startDate: "2026-02-02", lengthDays: 84, endedAt: null },
    goals: [{ id: "sg1", goalId: "fit", title: "Become fit", color: "green", archivedAt: null, tier: "primary", target: "Run 5k under 30 minutes", carriedFromId: null }],
  } : null,
  statusInputs: async () => ({ links: { projects: [], tasks: [] }, tasks: [], ratings: [], milestones: [], reviewed: false }),
  messages: async (userId, limit) => stored.filter(row => row.userId === userId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-limit),
  append: async (userId, rows) => { rows.forEach((row, index) => stored.push({ ...row, userId, id: `m${stored.length + index + 1}` })); },
  clear: async (userId) => { stored = stored.filter(row => row.userId !== userId); },
  saveDraft: async (userId, draft) => {
    const id = `d${drafts.length + 1}`;
    drafts.push({ ...draft, id, userId });
    return { ...draft, id, createdAt: clock, items: draft.items.map((row, index) => ({ ...row, id: `${id}-i${index + 1}`, state: "pending" as const })) } satisfies DraftRecord;
  },
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
const send = async (message: string, user = "alice") => await (await call("POST", `/coach/chat?timeZone=${zone}`, { user, body: { message } })).json() as CoachChatDto;
const history = async (user = "alice") => (await (await call("GET", "/coach/chat", { user })).json() as CoachChatDto).messages;

describe("chatting with the Coach", () => {
  it("answers with goal and schedule context and keeps the conversation", async () => {
    const result = await send("What should I focus on?");
    expect(calls[0]!.schema).toBe("coach_chat");
    expect(result.draft).toBeNull();
    expect(result.messages.map(row => [row.role, row.content, row.draftId])).toEqual([
      ["user", "What should I focus on?", null],
      ["assistant", "Your run fits best this morning.", null],
    ]);
    expect(await history()).toEqual(result.messages);
    const facts = calls[0]!.messages[1]!.content;
    expect(facts).toContain("Run 5k under 30 minutes");
    expect(facts).toContain("Too early");
    expect(facts).toContain("Meeting");
    expect(facts).not.toContain("run-id");
    expect(facts).not.toContain("Bob's task");
  });

  it("sends the earlier turns with the next message", async () => {
    await send("First question");
    await send("And then?");
    expect(calls[1]!.messages.slice(2).map(message => [message.role, message.content])).toEqual([
      ["user", "First question"], ["assistant", "Your run fits best this morning."], ["user", "And then?"],
    ]);
  });

  it("caps the earlier turns sent to the model at 20", async () => {
    for (let index = 0; index < 15; index++) { clock = new Date(clock.getTime() + 1_000); await send(`Q${index}`); }
    const last = calls.at(-1)!.messages;
    expect(last).toHaveLength(2 + 20 + 1);
    expect(last.at(-1)!.content).toBe("Q14");
  });

  it("keeps each user's chat to themselves", async () => {
    await send("Mine");
    expect(await history("bob")).toEqual([]);
  });

  it("turns a proposed change into a chat draft and edits no task", async () => {
    const before = snapshot();
    reply = (facts) => answer("I drafted a morning run for you.", [
      item("add", { task: ref(facts.toPlan, "Run"), day: "2026-02-10", start: "07:30", minutes: 45 }),
      item("move", { task: ref(facts.scheduled, "Meeting"), day: "2026-02-09", start: "14:00", minutes: 60 }),
    ], "Run before work.");
    const result = await send("Fit in a run tomorrow");
    expect(result.draft).toMatchObject({ kind: "chat", period: "2026-02-09", summary: "Run before work." });
    expect(result.draft!.items.map(row => [row.op, row.taskId, row.start, row.goalId])).toEqual([
      ["add", "run-id", "2026-02-10T06:30:00.000Z", "fit"],
      ["move", "meeting-id", "2026-02-09T13:00:00.000Z", null],
    ]);
    expect(result.messages.at(-1)).toMatchObject({ role: "assistant", draftId: result.draft!.id });
    expect(snapshot()).toBe(before);
  });

  it("keeps the reply but makes no draft when the changes do not fit", async () => {
    reply = (facts) => answer("Let me move things.", [
      item("add", { title: "Clash", day: "2026-02-09", start: "10:15", minutes: 30 }), // over the 10:00 meeting
    ], "x");
    const result = await send("Move things");
    expect(result.draft).toBeNull();
    expect(drafts).toEqual([]);
    expect(result.messages.at(-1)!.content).toMatch(/^Let me move things\.\n\n\(.*overlap.*\)$/);
  });

  it("stores nothing when the model fails, and says why", async () => {
    providers.set("alice", { provider: "openrouter", model: "broken", baseUrl: null, apiKey: "sk-or-test" });
    const result = await send("Hello");
    expect(result).toMatchObject({ messages: [], draft: null, message: "The provider is unavailable. Try again later.", error: { code: "overloaded", provider: "openrouter", retryable: true, message: "The provider is unavailable. Try again later." } });
    reply = () => "not json";
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" });
    expect((await send("Hello")).message).toContain("not valid JSON");
    expect(stored).toEqual([]);
  });

  it("asks for the key again when it no longer decrypts", async () => {
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: null });
    expect((await send("Hello")).message).toContain("API key");
    expect(calls).toEqual([]);
  });

  it("clears the conversation", async () => {
    await send("Hello");
    expect(await (await call("DELETE", "/coach/chat", { user: "alice" })).json()).toEqual({ messages: [] });
    expect(await history()).toEqual([]);
  });
});

describe("chat access", () => {
  it("needs a provider, a session, a todalo origin and a message", async () => {
    expect((await call("POST", "/coach/chat", { user: "bob", body: { message: "Hi" } })).status).toBe(404);
    expect((await call("GET", "/coach/chat")).status).toBe(401);
    expect((await call("POST", "/coach/chat", { cookie: "alice", origin: "https://evil.example", body: { message: "Hi" } })).status).toBe(403);
    expect((await call("DELETE", "/coach/chat", { cookie: "alice" })).status).toBe(403);
    expect((await call("POST", "/coach/chat", { user: "alice", body: { message: "  " } })).status).toBe(400);
    expect((await call("POST", "/coach/chat", { user: "alice", body: { message: "Hi", userId: "bob" } })).status).toBe(400);
    expect((await call("POST", "/coach/chat", { cookie: "alice", origin: "http://localhost:5173", body: { message: "Hi" } })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});
