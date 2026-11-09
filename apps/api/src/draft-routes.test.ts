import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { BusyEvent, DraftDayDto, DraftRecord, DraftsDto, DraftTask } from "@todalo/server/drafts";
import { createDraftRoutes } from "./draft-routes";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
let clock: Date;
const v1 = new Date("2026-02-01T00:00:00Z");
let providers: Map<string, CoachConfig>;
let tasks: Map<string, DraftTask & { userId: string; goalIds: string[] }>;
let drafts: (DraftRecord & { userId: string; status: "open" | "closed" })[];
let calls: { messages: CoachMessage[]; schema?: string }[];
/** The fake model's reply; it sees the facts it was sent. */
let reply: (facts: { toPlan: { ref: string; title: string }[]; scheduled: { ref: string; title: string }[] }) => string;
let pushed: string[];
/** Ticket 21: each user's current (not dismissed) recommendation by goal. */
let advice: Map<string, string>;
/** Ticket 28: each user's visible calendar events, and who shares event titles. */
let events: Map<string, BusyEvent[]>;
let sharing: Set<string>;

const task = (userId: string, id: string, extra: Partial<DraftTask> = {}) =>
  tasks.set(id, { userId, id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: v1, goalIds: [], ...extra });
const ref = (entries: { ref: string; title: string }[], title: string) => entries.find(entry => entry.title === title)!.ref;
const item = (op: string, extra: Record<string, unknown>) => ({ op, task: "", title: "", start: "", minutes: 0, goal: "", reason: "Fits.", ...extra });

beforeEach(() => {
  clock = new Date("2026-02-09T08:10:00Z");
  providers = new Map([["alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" }]]);
  tasks = new Map();
  drafts = [];
  calls = [];
  pushed = [];
  advice = new Map([["alice:fit", "Run in the mornings — your evening runs were moved twice."]]);
  events = new Map();
  sharing = new Set();
  task("alice", "run", { dueDate: new Date("2026-02-05T23:00:00Z"), goalIds: ["fit"] } as Partial<DraftTask>); // overdue
  task("alice", "meeting", { dueDate: new Date("2026-02-09T09:00:00Z"), dueDateEnd: new Date("2026-02-09T10:00:00Z") }); // 10:00-11:00
  task("alice", "admin", { dueDate: new Date("2026-02-09T14:00:00Z") }); // 15:00-15:30
  task("bob", "bobs");
  reply = (facts) => JSON.stringify({
    summary: "Your run comes first while you are fresh.",
    items: [
      item("add", { task: ref(facts.toPlan, "run"), start: "11:30", minutes: 45 }),
      item("move", { task: ref(facts.scheduled, "meeting"), start: "13:00", minutes: 60 }),
      item("remove", { task: ref(facts.scheduled, "admin") }),
      item("add", { title: "Stretch", start: "18:00", minutes: 15, goal: "g1" }),
    ],
  });
});

const snapshot = () => JSON.stringify([...tasks.values()]);

const app = createDraftRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async (userId) => providers.get(userId) ?? null,
  // In-memory fake provider with canned output; it never reaches a network.
  model: (config) => ({
    complete: async ({ messages, schema }) => {
      calls.push({ messages, schema: schema?.name });
      if (config.model === "broken") throw new CoachModelError("The provider is unavailable. Try again later.", "overloaded");
      return reply(JSON.parse(messages.at(-1)!.content));
    },
  }),
  dayContext: async (userId) => ({
    tasks: [...tasks.values()].filter(row => row.userId === userId),
    goals: [{ goalId: "fit", title: "Become fit", tier: "primary" }, { goalId: "side", title: "Side project", tier: "secondary" }],
    links: { projects: [], tasks: [...tasks.values()].filter(row => row.userId === userId).flatMap(row => row.goalIds.map(goalId => ({ goalId, taskId: row.id }))) },
    fixedTaskIds: [],
    events: events.get(userId) ?? [],
    shareEventTitles: sharing.has(userId),
  }),
  drafts: async (userId, draftId) => drafts.filter(draft => draft.userId === userId && draft.status === "open" && (!draftId || draft.id === draftId)).map(draft => structuredClone(draft)),
  save: async (userId, draft) => {
    for (const open of drafts) if (open.userId === userId && open.kind === draft.kind && open.period === draft.period) open.status = "closed";
    const id = `d${drafts.length + 1}`;
    const saved = { ...draft, id, userId, status: "open" as const, createdAt: clock, items: draft.items.map((row, index) => ({ ...row, id: `${id}-i${index + 1}`, state: "pending" as const })) };
    drafts.push(saved);
    return structuredClone(saved);
  },
  tasks: async (userId, ids) => [...tasks.values()].filter(row => row.userId === userId && ids.includes(row.id)),
  // The production batch's effect: tasks written, decisions recorded, closed when nothing is pending.
  resolve: async (userId, draft, { accepted, declined }) => {
    const stored = drafts.find(row => row.id === draft.id && row.userId === userId)!;
    for (const write of accepted) {
      const id = write.taskId ?? `new-${write.itemId}`;
      if (write.taskId) Object.assign(tasks.get(id)!, { dueDate: write.dueDate, dueDateEnd: write.dueDateEnd, updatedAt: clock });
      else task(userId, id, { title: write.title, dueDate: write.dueDate, dueDateEnd: write.dueDateEnd, updatedAt: clock, goalIds: write.goalId ? [write.goalId] : [] } as Partial<DraftTask>);
      pushed.push(id);
    }
    for (const row of stored.items) {
      if (accepted.some(write => write.itemId === row.id)) row.state = "accepted";
      if (declined.includes(row.id)) row.state = "declined";
    }
    if (!stored.overflow?.length && stored.items.every(row => row.state !== "pending")) stored.status = "closed";
  },
  settleOverflow: async (userId, draft) => {
    const stored = drafts.find(row => row.id === draft.id && row.userId === userId)!;
    stored.overflow = null;
    if (stored.items.every(row => row.state !== "pending")) stored.status = "closed";
  },
  recommendation: async (userId, goalId) => advice.get(`${userId}:${goalId}`) ?? null,
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
const draftDay = async (user = "alice") => await (await call("POST", `/coach/drafts/day?timeZone=${zone}`, { user })).json() as DraftDayDto;
const open = async (user = "alice") => (await (await call("GET", `/coach/drafts?timeZone=${zone}`, { user })).json() as DraftsDto).drafts;

describe("drafting today's plan", () => {
  it("stages adds, moves and removes with reasoning and changes no task", async () => {
    const before = snapshot();
    const { draft } = await draftDay();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.schema).toBe("day_draft");
    expect(draft).toMatchObject({ kind: "day", period: "2026-02-09", summary: "Your run comes first while you are fresh." });
    expect(draft!.items.map(row => [row.op, row.taskId, row.title, row.start, row.end, row.goalId, row.state])).toEqual([
      ["add", "run", "run", "2026-02-09T10:30:00.000Z", "2026-02-09T11:15:00.000Z", "fit", "pending"],
      ["move", "meeting", "meeting", "2026-02-09T12:00:00.000Z", "2026-02-09T13:00:00.000Z", null, "pending"],
      ["remove", "admin", "admin", "2026-02-08T23:00:00.000Z", null, null, "pending"],
      ["add", null, "Stretch", "2026-02-09T17:00:00.000Z", "2026-02-09T17:15:00.000Z", "fit", "pending"],
    ]);
    // The Coach can only write drafts: tasks and the calendar are untouched.
    expect(snapshot()).toBe(before);
    expect(pushed).toEqual([]);
    expect(await open()).toEqual([draft]);
  });

  it("sends only titles, times and goal tiers, with refs instead of task IDs", async () => {
    task("alice", "secret-id", { title: "Inbox thing" });
    await draftDay();
    const facts = calls[0]!.messages.at(-1)!.content;
    expect(facts).toContain("Inbox thing");
    expect(facts).not.toContain("secret-id");
    expect(facts).not.toContain("bobs");
  });

  it("rejects an invalid draft as a whole and stores nothing", async () => {
    reply = (facts) => JSON.stringify({ summary: "x", items: [
      item("add", { task: ref(facts.toPlan, "run"), start: "11:30", minutes: 45 }),
      item("add", { title: "Clash", start: "10:15", minutes: 30 }), // over the 10:00 meeting
    ] });
    const result = await draftDay();
    expect(result.draft).toBeNull();
    expect(result.message).toContain("overlap");
    expect(await open()).toEqual([]);
  });

  it("explains provider failures and an empty draft without storing one", async () => {
    providers.set("alice", { provider: "openrouter", model: "broken", baseUrl: null, apiKey: "sk-or-test" });
    expect(await draftDay()).toEqual({ draft: null, message: "The provider is unavailable. Try again later.", error: { code: "overloaded", provider: "openrouter", retryable: true, message: "The provider is unavailable. Try again later." } });
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" });
    reply = () => JSON.stringify({ summary: "Your day already works.", items: [] });
    expect(await draftDay()).toEqual({ draft: null, message: "Your day already works." });
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: null });
    expect(await draftDay()).toMatchObject({ message: expect.stringContaining("API key"), error: { code: "bad_key", provider: "openrouter", retryable: false } });
    expect(drafts).toEqual([]);
  });

  it("needs a provider: without one there is no Coach and no model call", async () => {
    expect((await call("POST", `/coach/drafts/day?timeZone=${zone}`, { user: "bob" })).status).toBe(404);
    expect(await open("bob")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("drafting again replaces the open draft for the day", async () => {
    const first = (await draftDay()).draft!;
    const second = (await draftDay()).draft!;
    expect((await open()).map(draft => draft.id)).toEqual([second.id]);
    expect((await call("POST", `/coach/drafts/${first.id}/accept`, { user: "alice", body: {} })).status).toBe(404);
  });

  it("leaves a past day's draft behind", async () => {
    await draftDay();
    clock = new Date("2026-02-10T08:00:00Z");
    expect(await open()).toEqual([]);
  });
});

describe("drafting a week (ticket 20)", () => {
  type WeekFacts = { days: { day: string }[]; goals: { ref: string; tier: string; scheduledMinutes: number }[]; toPlan: { ref: string; title: string }[]; scheduled: { ref: string; title: string; day: string }[] };
  const draftWeek = async (start: string | null, user = "alice") =>
    await call("POST", `/coach/drafts/week?timeZone=${zone}${start ? `&start=${start}` : ""}`, { user });
  const facts = () => JSON.parse(calls.at(-1)!.messages.at(-1)!.content) as WeekFacts;
  beforeEach(() => {
    // Next week: primary gym on Tuesday, secondary side work on Wednesday and Thursday evenings.
    task("alice", "gym", { dueDate: new Date("2026-02-17T06:00:00Z"), dueDateEnd: new Date("2026-02-17T07:00:00Z"), goalIds: ["fit"] } as Partial<DraftTask>);
    task("alice", "side-a", { dueDate: new Date("2026-02-18T17:00:00Z"), dueDateEnd: new Date("2026-02-18T19:00:00Z"), goalIds: ["side"] } as Partial<DraftTask>);
    task("alice", "side-b", { dueDate: new Date("2026-02-19T17:00:00Z"), dueDateEnd: new Date("2026-02-19T19:00:00Z"), goalIds: ["side"] } as Partial<DraftTask>);
    reply = (raw) => {
      const week = raw as unknown as WeekFacts;
      return JSON.stringify({
        summary: "Short week: your side project gives way to training.",
        items: [
          item("add", { task: ref(week.toPlan, "run"), day: "2026-02-16", start: "07:00", minutes: 45 }),
          item("remove", { task: ref(week.scheduled, "side-a"), day: "" }),
          item("move", { task: ref(week.scheduled, "side-b"), day: "2026-02-21", start: "10:00", minutes: 60 }),
        ],
      });
    };
  });

  it("stages next week's adds, moves and removes from the week's facts and changes no task", async () => {
    const before = snapshot();
    const response = await draftWeek("2026-02-16");
    const { draft } = await response.json() as DraftDayDto;
    expect(calls[0]!.schema).toBe("week_draft");
    const sent = facts();
    expect(sent.days.map(day => day.day)).toEqual(["2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22"]);
    expect(sent.goals.map(goal => [goal.tier, goal.scheduledMinutes])).toEqual([["primary", 60], ["secondary", 240]]);
    expect(sent.scheduled.map(entry => [entry.title, entry.day])).toEqual([["gym", "2026-02-17"], ["side-a", "2026-02-18"], ["side-b", "2026-02-19"]]);
    expect(draft).toMatchObject({ kind: "week", period: "2026-02-16", summary: "Short week: your side project gives way to training." });
    expect(draft!.items.map(row => [row.op, row.taskId, row.start, row.end, row.goalId])).toEqual([
      ["add", "run", "2026-02-16T06:00:00.000Z", "2026-02-16T06:45:00.000Z", "fit"],
      // Dropped: off the schedule, kept on its own day.
      ["remove", "side-a", "2026-02-17T23:00:00.000Z", null, "side"],
      // Postponed to Saturday.
      ["move", "side-b", "2026-02-21T09:00:00.000Z", "2026-02-21T10:00:00.000Z", "side"],
    ]);
    expect(snapshot()).toBe(before);
    expect(pushed).toEqual([]);
  });

  it("keeps a day draft and a week draft open side by side; drafting the week again replaces only the week's", async () => {
    const week = (await (await draftWeek("2026-02-16")).json() as DraftDayDto).draft!;
    reply = () => JSON.stringify({ summary: "Today.", items: [item("add", { title: "Stretch", start: "18:00", minutes: 15 })] });
    const day = (await draftDay()).draft!;
    expect((await open()).map(draft => draft.id)).toEqual([week.id, day.id]);
    reply = () => JSON.stringify({ summary: "Again.", items: [item("add", { title: "Plan", day: "2026-02-16", start: "09:00", minutes: 30 })] });
    const again = (await (await draftWeek("2026-02-16")).json() as DraftDayDto).draft!;
    expect((await open()).map(draft => draft.id)).toEqual([day.id, again.id]);
  });

  it("protects primary goals: a draft that drops primary-goal work is rejected as a whole", async () => {
    reply = (raw) => JSON.stringify({ summary: "x", items: [item("remove", { task: ref((raw as unknown as WeekFacts).scheduled, "gym") })] });
    const result = await (await draftWeek("2026-02-16")).json() as DraftDayDto;
    expect(result.draft).toBeNull();
    expect(result.message).toContain("primary-goal work");
    expect(await open()).toEqual([]);
  });

  it("accepts and declines a week draft like a day's: per item, then the rest", async () => {
    const { draft } = await (await draftWeek("2026-02-16")).json() as DraftDayDto;
    const [, drop, postpone] = draft!.items;
    const declined = await (await call("POST", `/coach/drafts/${draft!.id}/decline`, { user: "alice", body: { itemIds: [drop!.id] } })).json() as DraftDayDto;
    expect(declined.draft!.items.map(row => row.state)).toEqual(["pending", "declined", "pending"]);
    expect(tasks.get("side-a")!.dueDate).toEqual(new Date("2026-02-18T17:00:00Z"));
    expect(await (await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: {} })).json()).toEqual({ draft: null });
    expect(tasks.get("side-b")).toMatchObject({ dueDate: new Date("2026-02-21T09:00:00Z"), dueDateEnd: new Date("2026-02-21T10:00:00Z") });
    expect(tasks.get("run")!.dueDate).toEqual(new Date("2026-02-16T06:00:00Z"));
    expect(pushed.sort()).toEqual(["run", "side-b"]);
    expect(postpone!.state).toBe("pending");
  });

  it("stays open through its week and is left behind after", async () => {
    await draftWeek("2026-02-16");
    clock = new Date("2026-02-22T20:00:00Z");
    expect(await open()).toHaveLength(1);
    clock = new Date("2026-02-23T08:00:00Z");
    expect(await open()).toEqual([]);
  });

  it("needs a week that is not over, and a provider; without one there is no model call", async () => {
    for (const start of [null, "2026-02-01", "2026-02-30", "next"]) expect((await draftWeek(start)).status).toBe(400);
    expect((await draftWeek("2026-02-16", "bob")).status).toBe(404);
    expect((await call("POST", `/coach/drafts/week?timeZone=${zone}&start=2026-02-16`, { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect(calls).toEqual([]);
    expect(drafts).toEqual([]);
  });
});

describe("accepting and declining", () => {
  it("accepts the whole draft at once: new task, times set, removed task keeps its day", async () => {
    const { draft } = await draftDay();
    const response = await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draft: null });
    expect(tasks.get("run")).toMatchObject({ dueDate: new Date("2026-02-09T10:30:00Z"), dueDateEnd: new Date("2026-02-09T11:15:00Z") });
    expect(tasks.get("meeting")).toMatchObject({ dueDate: new Date("2026-02-09T12:00:00Z"), dueDateEnd: new Date("2026-02-09T13:00:00Z") });
    expect(tasks.get("admin")).toMatchObject({ dueDate: new Date("2026-02-08T23:00:00Z"), dueDateEnd: null });
    expect(tasks.get(`new-${draft!.items[3]!.id}`)).toMatchObject({ title: "Stretch", goalIds: ["fit"] });
    expect(pushed).toHaveLength(4);
    expect(await open()).toEqual([]);
  });

  it("accepts or declines single items; the rest stay pending", async () => {
    const { draft } = await draftDay();
    const [add, move, remove] = draft!.items;
    const accepted = await (await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: { itemIds: [move!.id] } })).json() as DraftDayDto;
    expect(accepted.draft!.items.map(row => row.state)).toEqual(["pending", "accepted", "pending", "pending"]);
    expect(tasks.get("meeting")!.dueDate).toEqual(new Date("2026-02-09T12:00:00Z"));
    expect(tasks.get("run")!.dueDate).toEqual(new Date("2026-02-05T23:00:00Z"));
    const declined = await (await call("POST", `/coach/drafts/${draft!.id}/decline`, { user: "alice", body: { itemIds: [add!.id, remove!.id] } })).json() as DraftDayDto;
    expect(declined.draft!.items.map(row => row.state)).toEqual(["declined", "accepted", "declined", "pending"]);
    expect(tasks.get("admin")!.dueDate).toEqual(new Date("2026-02-09T14:00:00Z"));
    // A decided item cannot be decided again.
    expect((await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: { itemIds: [add!.id] } })).status).toBe(404);
  });

  it("declines everything and touches nothing", async () => {
    const before = snapshot();
    const { draft } = await draftDay();
    expect(await (await call("POST", `/coach/drafts/${draft!.id}/decline`, { user: "alice", body: {} })).json()).toEqual({ draft: null });
    expect(snapshot()).toBe(before);
    expect(pushed).toEqual([]);
  });

  it("writes nothing when a drafted task changed since (412)", async () => {
    const { draft } = await draftDay();
    Object.assign(tasks.get("admin")!, { title: "admin (edited)", updatedAt: new Date("2026-02-09T08:30:00Z") });
    const before = snapshot();
    const response = await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: {} });
    expect(response.status).toBe(412);
    expect((await response.json() as { code: string }).code).toBe("TASK_CHANGED");
    expect(snapshot()).toBe(before);
    // Items whose own tasks are unchanged can still be accepted one by one.
    expect((await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: { itemIds: [draft!.items[0]!.id] } })).status).toBe(200);
  });

  it("keeps drafts private, checks the origin and rejects bad bodies", async () => {
    const { draft } = await draftDay();
    const path = `/coach/drafts/${draft!.id}/accept`;
    expect((await call("POST", path, { user: "bob", body: {} })).status).toBe(404);
    expect((await call("POST", path, { body: {} })).status).toBe(403);
    expect((await call("POST", path, { cookie: "alice", origin: "https://evil.example", body: {} })).status).toBe(403);
    expect((await call("POST", `/coach/drafts/day?timeZone=${zone}`, { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("GET", "/coach/drafts")).status).toBe(401);
    for (const body of [{ itemIds: [] }, { itemIds: "x" }, { all: true }]) expect((await call("POST", path, { user: "alice", body })).status).toBe(400);
    expect((await call("POST", path, { cookie: "alice", origin: "http://localhost:5173", body: { itemIds: [draft!.items[0]!.id] } })).status).toBe(200);
    expect(await open("bob")).toEqual([]);
  });
});

describe("calendar events and overflow (ticket 28)", () => {
  const event = (title: string, start: string, end: string, allDay = false): BusyEvent => ({ title, start: new Date(start), end: new Date(end), allDay });
  const facts = () => JSON.parse(calls.at(-1)!.messages.at(-1)!.content) as { events: Record<string, unknown>[]; allDayEvents: Record<string, unknown>[] };
  beforeEach(() => {
    events.set("alice", [
      event("Dentist", "2026-02-09T12:00:00Z", "2026-02-09T13:00:00Z"), // 13:00-14:00
      event("Holiday", "2026-02-09T00:00:00Z", "2026-02-10T00:00:00Z", true),
      event("Next week", "2026-02-16T12:00:00Z", "2026-02-16T13:00:00Z"),
    ]);
    events.set("bob", [event("Bob's secret", "2026-02-09T12:00:00Z", "2026-02-09T13:00:00Z")]);
  });
  const overflowReply = (raw: { toPlan: { ref: string; title: string }[] }) => JSON.stringify({
    summary: "Your afternoon is taken.",
    items: [item("add", { title: "Stretch", start: "18:00", minutes: 15 })],
    overflow: [{ task: ref(raw.toPlan, "run"), title: "", minutes: 45, goal: "", reason: "The dentist and the meeting fill the day." }],
  });

  it("sends the day's timed events as busy times only, all-day ones as context, never another user's", async () => {
    await draftDay();
    expect(facts().events).toEqual([{ start: "13:00", minutes: 60 }]);
    expect(facts().allDayEvents).toEqual([{}]);
    expect(calls[0]!.messages.at(-1)!.content).not.toMatch(/Dentist|Holiday|secret/);
    sharing.add("alice");
    await draftDay();
    expect(facts().events).toEqual([{ title: "Dentist", start: "13:00", minutes: 60 }]);
    expect(facts().allDayEvents).toEqual([{ title: "Holiday" }]);
  });

  it("rejects a draft that overlaps a calendar event, as it does overlapping tasks; all-day events block nothing", async () => {
    reply = () => JSON.stringify({ summary: "x", items: [item("add", { title: "Clash", start: "13:30", minutes: 30 })] });
    const result = await draftDay();
    expect(result.draft).toBeNull();
    expect(result.message).toContain("calendar event");
    expect(await open()).toEqual([]);
    reply = () => JSON.stringify({ summary: "x", items: [item("add", { title: "Fits", start: "14:00", minutes: 30 })] });
    expect((await draftDay()).draft).not.toBeNull();
  });

  it("returns what does not fit as overflow, not placed; No drops it and closes the decided draft", async () => {
    reply = overflowReply;
    const { draft } = await draftDay();
    expect(draft!.items.map(row => row.title)).toEqual(["Stretch"]);
    expect(draft!.overflow).toEqual([{ title: "run", minutes: 45, reason: "The dentist and the meeting fill the day." }]);
    await call("POST", `/coach/drafts/${draft!.id}/accept`, { user: "alice", body: {} });
    // Its items decided, the draft stays open for the overflow question.
    expect((await open())[0]!.overflow).toHaveLength(1);
    const before = snapshot();
    const dropped = await (await call("POST", `/coach/drafts/${draft!.id}/decline?timeZone=${zone}`, { user: "alice", body: { overflow: true } })).json() as DraftDayDto;
    expect(dropped).toEqual({ draft: null });
    expect(snapshot()).toBe(before);
    expect(await open()).toEqual([]);
  });

  it("Yes drafts the overflow onto the next day with room, around events, and checks it is fresh on accept", async () => {
    reply = overflowReply;
    // Tomorrow is taken from 08:00 to 22:00, so Wednesday gets it, after its own 08:00-09:00 event.
    events.get("alice")!.push(event("Offsite", "2026-02-10T07:00:00Z", "2026-02-10T21:00:00Z"), event("Standup", "2026-02-11T07:00:00Z", "2026-02-11T08:00:00Z"));
    const { draft } = await draftDay();
    const before = snapshot();
    const result = await (await call("POST", `/coach/drafts/${draft!.id}/accept?timeZone=${zone}`, { user: "alice", body: { overflow: true } })).json() as DraftDayDto;
    expect(calls).toHaveLength(1);
    expect(snapshot()).toBe(before);
    expect(result.draft!.overflow).toBeUndefined();
    expect(result.draft!.items).toHaveLength(1);
    expect(result.next).toMatchObject({ kind: "day", period: "2026-02-11" });
    expect(result.next!.items.map(row => [row.op, row.taskId, row.start, row.end])).toEqual([["add", "run", "2026-02-11T08:00:00.000Z", "2026-02-11T08:45:00.000Z"]]);
    expect((await open()).map(row => row.period)).toEqual(["2026-02-09", "2026-02-11"]);
    // Asked twice: the overflow is gone.
    expect((await call("POST", `/coach/drafts/${draft!.id}/accept?timeZone=${zone}`, { user: "alice", body: { overflow: true } })).status).toBe(404);
    Object.assign(tasks.get("run")!, { updatedAt: new Date("2026-02-09T08:30:00Z") });
    expect((await call("POST", `/coach/drafts/${result.next!.id}/accept`, { user: "alice", body: {} })).status).toBe(412);
  });

  it("keeps the overflow when no day in the next two weeks has room", async () => {
    reply = overflowReply;
    events.get("alice")!.push(event("Sabbatical", "2026-02-10T00:00:00Z", "2026-03-01T00:00:00Z"));
    const { draft } = await draftDay();
    const result = await (await call("POST", `/coach/drafts/${draft!.id}/accept?timeZone=${zone}`, { user: "alice", body: { overflow: true } })).json() as DraftDayDto;
    expect(result.message).toBe("No day in the next two weeks has room for these tasks.");
    expect(result.draft!.overflow).toHaveLength(1);
    expect(result.next).toBeUndefined();
  });

  it("rejects overflow answers mixed with items, on a draft without overflow, or another user's", async () => {
    reply = () => JSON.stringify({ summary: "x", items: [item("add", { title: "Fits", start: "14:00", minutes: 30 })] });
    const { draft } = await draftDay();
    const path = `/coach/drafts/${draft!.id}/accept?timeZone=${zone}`;
    expect((await call("POST", path, { user: "alice", body: { overflow: true, itemIds: [draft!.items[0]!.id] } })).status).toBe(400);
    expect((await call("POST", path, { user: "alice", body: { overflow: true } })).status).toBe(404);
    expect((await call("POST", path, { user: "bob", body: { overflow: true } })).status).toBe(404);
  });
});

describe("Update schedule on a recommendation (ticket 21)", () => {
  const update = (goalId: string, init: { user?: string; cookie?: string; origin?: string } = { user: "alice" }) =>
    call("POST", `/coach/recommendations/${goalId}/draft?timeZone=${zone}`, init);
  beforeEach(() => {
    reply = (raw) => JSON.stringify({ summary: "Mornings for running.", items: [item("add", { task: ref(raw.toPlan, "run"), day: "2026-02-10", start: "07:00", minutes: 45 })] });
  });

  it("drafts this week with the recommendation in focus and changes no task", async () => {
    const before = snapshot();
    const { draft } = await (await update("fit")).json() as DraftDayDto;
    expect(calls[0]!.schema).toBe("week_draft");
    const sent = JSON.parse(calls[0]!.messages.at(-1)!.content) as { days: { day: string }[]; focus: unknown };
    expect(sent.focus).toEqual({ goal: "g1", recommendation: "Run in the mornings — your evening runs were moved twice." });
    expect(sent.days[0]!.day).toBe("2026-02-09");
    expect(calls[0]!.messages[0]!.content).toContain("carries it out first");
    expect(draft).toMatchObject({ kind: "week", period: "2026-02-09", items: [{ op: "add", taskId: "run", goalId: "fit" }] });
    expect(snapshot()).toBe(before);
  });

  it("drafts next week once this one is nearly over", async () => {
    clock = new Date("2026-02-13T08:00:00Z"); // Friday
    reply = (raw) => JSON.stringify({ summary: "x", items: [item("add", { task: ref(raw.toPlan, "run"), day: "2026-02-16", start: "07:00", minutes: 45 })] });
    expect((await (await update("fit")).json() as DraftDayDto).draft).toMatchObject({ kind: "week", period: "2026-02-16" });
  });

  it("needs a current recommendation, a provider and an allowed origin; otherwise no model call", async () => {
    expect((await update("side")).status).toBe(404);
    expect((await update("fit", { user: "bob" })).status).toBe(404);
    expect((await update("fit", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    // A recommendation for a goal no longer in the season.
    advice.set("alice:gone", "Do it.");
    expect((await update("gone")).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
