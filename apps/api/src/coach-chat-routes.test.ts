import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { ChatMessageRecord, CoachChatDto } from "@todalo/server/coach-chat";
import type { CoachDocumentRecord, CoachDocumentsDto } from "@todalo/server/coach-documents";
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
let documents: (CoachDocumentRecord & { userId: string })[];
/** Open drafts the chat may revise (the real store's getOpenDrafts). */
let opened: (DraftRecord & { userId: string })[];
type Facts = { pending: { ref: string; op: string; title: string; day?: string; start?: string; minutes?: number }[]; goals: { ref: string; title: string; target: string; status: string }[]; scheduled: { ref: string; title: string }[]; toPlan: { ref: string; title: string }[]; days: { day: string }[]; tasks: { ref: string; title: string }[]; documents: { ref: string; name: string; text?: string; note?: string }[] };
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
  documents = [];
  opened = [];
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
  clear: async (userId) => { stored = stored.filter(row => row.userId !== userId); documents = documents.filter(row => row.userId !== userId); },
  documents: async (userId) => documents.filter(row => row.userId === userId),
  addDocuments: async (userId, rows) => { rows.forEach(row => documents.push({ ...row, userId, id: `doc${documents.length + 1}`, createdAt: clock })); },
  deleteDocument: async (userId, id) => { documents = documents.filter(row => !(row.userId === userId && row.id === id)); },
  drafts: async (userId) => opened.filter(row => row.userId === userId),
  // The production batch's effect: new times and names, dropped items declined.
  revise: async (userId, draft, revisions) => {
    const items = opened.find(row => row.id === draft.id && row.userId === userId)!.items;
    for (const revision of revisions) {
      const row = items.find(entry => entry.id === revision.itemId)!;
      if (revision.drop) row.state = "declined";
      if (revision.startAt) Object.assign(row, { startAt: revision.startAt, endAt: revision.endAt });
      if (revision.rename) row.title = revision.rename;
    }
  },
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
/** Ticket 29: a multipart upload, as the browser sends it. */
const upload = (files: File[], user = "alice") => {
  const body = new FormData();
  files.forEach(file => body.append("files", file));
  return app.handle(new Request("http://localhost/api/v1/coach/documents", { method: "POST", headers: { authorization: `Bearer ${user}` }, body }));
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
    expect(await (await call("DELETE", "/coach/chat", { user: "alice" })).json()).toEqual({ messages: [], documents: [] });
    expect(await history()).toEqual([]);
  });
});

describe("documents in the chat (ticket 29)", () => {
  const notes = () => new File(["Week 1: essay outline\nWeek 2: midterm"], "syllabus.md", { type: "" });
  const photo = () => new File([new Uint8Array([137, 80, 78, 71])], "board.png", { type: "image/png" });

  it("keeps uploaded documents with the session, reads their text once, and lists them with the chat", async () => {
    const response = await upload([notes(), photo()]);
    expect(response.status).toBe(201);
    expect((await response.json() as CoachDocumentsDto).documents).toEqual([
      { id: "doc1", name: "syllabus.md", mediaType: "text/markdown", byteSize: 37, kind: "text" },
      { id: "doc2", name: "board.png", mediaType: "image/png", byteSize: 4, kind: "image" },
    ]);
    expect(documents.map(row => row.text)).toEqual(["Week 1: essay outline\nWeek 2: midterm", null]);
    expect((await (await call("GET", "/coach/chat", { user: "alice" })).json() as CoachChatDto).documents).toHaveLength(2);
    expect((await (await call("GET", "/coach/chat", { user: "bob" })).json() as CoachChatDto).documents).toEqual([]);
  });

  it("refuses other kinds, too much and other origins; deleting and clearing remove documents", async () => {
    const refused = await upload([new File(["MZ"], "tool.exe", { type: "application/octet-stream" })]);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "INVALID_INPUT", message: expect.stringMatching(/PDF, Word/) });
    expect((await upload(Array.from({ length: 6 }, notes))).status).toBe(400);
    const oversized = new Request("http://localhost/api/v1/coach/documents", { method: "POST", headers: { authorization: "Bearer alice", "content-type": "multipart/form-data; boundary=x", "content-length": String(11 * 1024 * 1024) }, body: "x" });
    expect(await (await app.handle(oversized)).json()).toEqual({ code: "FILES_TOO_LARGE", message: "A paste batch must be at most 10 MB." });
    const foreign = new Request("http://localhost/api/v1/coach/documents", { method: "POST", headers: { cookie: "session=alice", origin: "https://evil.example" }, body: new FormData() });
    expect((await app.handle(foreign)).status).toBe(403);
    await upload([notes(), photo()]);
    expect(await (await call("DELETE", "/coach/documents/doc1", { user: "alice" })).json()).toEqual({ documents: [expect.objectContaining({ id: "doc2" })] });
    await call("DELETE", "/coach/documents/doc2", { user: "bob" });
    expect(documents).toHaveLength(1);
    await call("DELETE", "/coach/chat", { user: "alice" });
    expect(documents).toEqual([]);
  });

  it("gives the model the documents' text, and images only when its provider reads them", async () => {
    await upload([notes(), photo()]);
    await send("What is due?");
    const facts = JSON.parse(calls[0]!.messages[1]!.content.replace(/^Facts: /, "")) as Facts;
    expect(facts.documents).toEqual([
      { ref: "d1", name: "syllabus.md", kind: "text", text: "Week 1: essay outline\nWeek 2: midterm" },
      { ref: "d2", name: "board.png", kind: "image", note: "an image this model cannot see; only its name is known" },
    ]);
    expect(calls[0]!.messages.at(-1)!.images).toBeUndefined();
    providers.set("alice", { provider: "anthropic", model: "m", baseUrl: null, apiKey: "sk-ant" });
    await send("And this photo?");
    expect(calls[1]!.messages.at(-1)!.images).toEqual([{ mediaType: "image/png", data: Buffer.from([137, 80, 78, 71]).toString("base64") }]);
  });

  it("turns a document into tasks, sub-tasks and an attachment as one chat draft, editing nothing", async () => {
    task("alice", "essay-id", { title: "Essay" });
    await upload([notes()]);
    const before = snapshot();
    reply = (facts) => answer("I drafted the midterm with a review step and attached the syllabus to your essay.", [
      item("add", { title: "Midterm", day: "2026-02-16" }),
      item("subtask", { title: "Review notes", parent: "#1" }),
      item("attach", { document: facts.documents[0]!.ref, parent: ref(facts.toPlan, "Essay") }),
    ], "From the syllabus.");
    const result = await send("Turn this syllabus into tasks");
    expect(result.draft!.items.map(row => [row.op, row.title, row.parentId ?? null, row.parentItemId ?? null, row.documentId ?? null])).toEqual([
      ["add", "Midterm", null, null, null],
      ["subtask", "Review notes", null, null, null],
      ["attach", "syllabus.md", "essay-id", null, "doc1"],
    ]);
    // The fake store keeps the parser's index; the real saveDraft turns it into the parent item's ID.
    expect(drafts[0]!.items[1]!.parentIndex).toBe(0);
    expect(snapshot()).toBe(before);
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

describe("revising pending changes from the chat", () => {
  // The user's open day draft proposes a new task today 14:30-15:30.
  const title = "Work on QR Bill for Dimetra";
  beforeEach(() => {
    opened.push({ id: "day1", userId: "alice", kind: "day", period: "2026-02-09", summary: "", createdAt: clock, items: [
      { id: "day1-qr", op: "add", taskId: null, title, startAt: new Date("2026-02-09T13:30:00Z"), endAt: new Date("2026-02-09T14:30:00Z"), goalId: null, reason: "", seenUpdatedAt: null, state: "pending" },
    ] });
  });
  const qr = () => opened[0]!.items[0]!;

  it("moves the pending item itself (no second draft), so it shows at its new time, and says so", async () => {
    reply = (facts) => answer("Sure, Wednesday afternoon.", [item("move", { task: facts.pending.find(row => row.title === title)!.ref, day: "2026-02-11", start: "14:00", minutes: 60 })]);
    const result = await send("move it to Wednesday");
    const facts = JSON.parse(calls[0]!.messages[1]!.content.replace(/^Facts: /, "")) as Facts;
    expect(facts.pending).toEqual([{ ref: "c1", op: "add", title, day: "2026-02-09", start: "14:30", minutes: 60 }]);
    expect(result.draft).toBeNull();
    expect(drafts).toEqual([]);
    expect(qr()).toMatchObject({ startAt: new Date("2026-02-11T13:00:00Z"), endAt: new Date("2026-02-11T14:00:00Z"), state: "pending" });
    expect(result.messages.at(-1)!.content).toBe(`Sure, Wednesday afternoon.\n\nUpdated the plan: "${title}" moved to Wed 14:00.`);
  });

  it("treats a new task titled as a pending one as that task again, and marks what is only proposed", async () => {
    reply = () => answer("Here you go.", [
      item("add", { title: "  work on QR bill   for dimetra ", day: "2026-02-11", start: "12:00", minutes: 120 }),
      item("add", { title: "Call the bank", day: "2026-02-10", start: "09:00", minutes: 30 }),
    ], "Bank call.");
    const result = await send("Put two hours on the QR bill Wednesday at noon and call the bank tomorrow");
    expect(qr()).toMatchObject({ title, startAt: new Date("2026-02-11T11:00:00Z"), endAt: new Date("2026-02-11T13:00:00Z"), state: "pending" });
    expect(result.draft!.items.map(row => [row.op, row.title])).toEqual([["add", "Call the bank"]]);
    expect(result.messages.at(-1)!.content).toBe(`Here you go.\n\nUpdated the plan: "${title}" moved to Wed 12:00.\nProposed: 1 added. Accept with ✓.`);
  });

  it("checks a revision by the draft rules, and drops one when asked", async () => {
    reply = () => answer("Moved.", [item("move", { task: "c1", day: "2026-02-09", start: "10:15", minutes: 30 })]); // over the 10:00 meeting
    expect((await send("Move it to 10:15")).messages.at(-1)!.content).toMatch(/overlap/);
    reply = () => answer("Done.", [item("add", { title: "Clash", day: "2026-02-09", start: "14:45", minutes: 30 })]); // over the pending block
    expect((await send("Add a clash")).draft).toBeNull();
    expect(qr()).toMatchObject({ startAt: new Date("2026-02-09T13:30:00Z"), state: "pending" });
    reply = () => answer("Dropped it.", [item("remove", { task: "c1" })]);
    const result = await send("Drop it");
    expect(qr().state).toBe("declined");
    expect(result.messages.at(-1)!.content).toBe(`Dropped it.\n\nUpdated the plan: "${title}" dropped.`);
  });
});
