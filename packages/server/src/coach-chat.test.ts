import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { chatExtras, chatFacts, chatMessages, chatSchema, parseChatReply, tidyIntent } from "./coach-chat";
import { weekPlan, type DraftTask } from "./drafts";
import { staleTasks } from "./task-dto";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
const now = new Date("2026-02-09T08:10:00Z");
const task = (id: string, extra: Partial<DraftTask> = {}): DraftTask =>
  ({ id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: now, ...extra });
const plan = weekPlan({ zone, now, start: "2026-02-09", context: {
  tasks: [task("run"), task("talk", { dueDate: new Date("2026-02-09T13:00:00Z"), dueDateEnd: new Date("2026-02-09T14:00:00Z") })],
  goals: [{ goalId: "fit", title: "Fit", tier: "primary" }], links: { projects: [], tasks: [{ goalId: "fit", taskId: "talk" }] }, fixedTaskIds: [],
} });
const item = (op: string, extra: Record<string, unknown>) => ({ op, task: "", title: "", day: "", start: "", minutes: 0, goal: "", reason: "r", ...extra });
const reply = (items: unknown[], text = "Sure.") => JSON.stringify({ reply: text, summary: "s", items });

describe("parseChatReply", () => {
  it.each([
    ["no items: just the reply", reply([]), "Sure.", 0],
    ["a valid add: a draft", reply([item("add", { task: "t2", day: "2026-02-10", start: "08:00", minutes: 30 })]), "Sure.\n\nProposed: 1 added. Accept with ✓.", 1],
    ["an unknown ref: reply with a note", reply([item("add", { task: "t9", day: "2026-02-10", start: "08:00", minutes: 30 })]), /^Sure\.\n\n\(.*cannot add t9.*Ask again/, null],
    ["removing primary-goal work: reply with a note", reply([item("remove", { task: "t1" })]), /primary-goal work/, null],
  ])("%s", (_, content, text, count) => {
    const result = parseChatReply(content, plan);
    if (typeof text === "string") expect(result.reply).toBe(text); else expect(result.reply).toMatch(text);
    expect(result.draft?.items.length ?? null).toBe(count || null);
  });

  it("ticket 28: overflow alone is a draft (nothing placed)", () => {
    const content = JSON.stringify({ reply: "Your week is full.", summary: "s", items: [], overflow: [{ task: "t2", title: "", minutes: 30, goal: "", reason: "No room." }] });
    expect(parseChatReply(content, plan).draft).toMatchObject({ items: [], overflow: [{ taskId: "run", minutes: 30 }] });
  });

  it.each([["not JSON", "nope"], ["an empty reply", reply([], "  ")], ["a wrong shape", JSON.stringify({ text: "hi" })]])("rejects %s", (_, content) => {
    expect(() => parseChatReply(content, plan)).toThrow(CoachModelError);
  });
});

describe("due-day tasks, sub-tasks and attachments (ticket 29)", () => {
  const context = { tasks: [task("run"), task("essay", { title: "Essay" }), task("deep", { parentId: "d2" }), task("d2", { parentId: "d1" }), task("d1", { parentId: "essay" })] };
  const syllabus = { id: "doc", name: "syllabus.pdf", mediaType: "application/pdf", byteSize: 10, content: "", text: "Week 1: essay", createdAt: now };
  const extras = chatExtras(plan, context, [syllabus]);
  const other = (title: string) => [...extras.others].find(([, row]) => row.title === title)![0];
  const parse = (items: unknown[]) => parseChatReply(reply(items), plan, extras);

  it("offers the other open tasks after the plan's refs and the documents as d1…", () => {
    const facts = chatFacts(plan, new Map(), extras, false);
    expect(facts.tasks.map(row => row.title)).toContain("Essay");
    expect(facts.tasks.every(row => Number(row.ref.slice(1)) > plan.scheduled.size + plan.toPlan.size)).toBe(true);
    expect(facts.documents).toEqual([{ ref: "d1", name: "syllabus.pdf", kind: "pdf", text: "Week 1: essay" }]);
    const ops = (chatSchema.schema as { properties: { items: { items: { properties: { op: { enum: string[] } }; required: string[] } } } }).properties.items.items;
    expect(ops.properties.op.enum).toEqual(["add", "move", "remove", "subtask", "attach", "complete", "delete", "horizon", "keep"]);
    expect(ops.required).toEqual(expect.arrayContaining(["parent", "document", "day"]));
  });

  it("drafts a new task due on a day, its sub-task (#1) and attaches the document to an existing task", () => {
    const draft = parse([
      item("add", { title: "Midterm", day: "2026-03-03" }),
      item("subtask", { title: "Review notes", parent: "#1" }),
      item("attach", { document: "d1", parent: other("Essay") }),
      item("add", { task: "t2", day: "2026-02-10", start: "08:00", minutes: 30 }),
    ]).draft!;
    expect(draft.items.map(row => [row.op, row.title, row.endAt, row.parentIndex ?? row.parentId ?? null, row.documentId ?? null])).toEqual([
      ["add", "Midterm", null, null, null], ["subtask", "Review notes", null, 0, null], ["attach", "syllabus.pdf", null, "essay", "doc"], ["add", "run", expect.any(Date), null, null],
    ]);
    expect(draft.items[0]!.startAt.toISOString()).toBe("2026-03-02T23:00:00.000Z");
  });

  it.each([
    ["a #N that is not a new task above", [item("subtask", { title: "x", parent: "#1" })], /parent #1/],
    ["an unknown parent", [item("subtask", { title: "x", parent: "t99" })], /parent t99/],
    ["a sub-task nested too deep", [item("subtask", { title: "x", parent: other("deep") })], /too deep/],
    ["an unknown document", [item("attach", { document: "d2", parent: other("Essay") })], /document d2/],
    ["the same document twice on a task", [item("attach", { document: "d1", parent: other("Essay") }), item("attach", { document: "d1", parent: other("Essay") })], /twice/],
    ["a due day in the past", [item("add", { title: "Late", day: "2026-02-01" })], /due day/],
  ])("drops the draft for %s", (_, items, why) => {
    const result = parse(items);
    expect(result.draft).toBeNull();
    expect(result.reply).toMatch(why);
  });
});

describe("complete, delete and move (ticket 30)", () => {
  const context = {
    tasks: [task("run"), task("report", { title: "Report", projectId: "work", dueDate: new Date("2026-03-01T23:00:00Z") }), task("ritual", { title: "Check-in" }), task("old", { title: "Old QA", status: "done" })],
    fixedTaskIds: ["ritual"],
    destinations: { projects: [{ id: "work", name: "Work" }, { id: "health", name: "Health" }], sections: [{ id: "gym", projectId: "health", name: "Gym" }] },
  };
  const extras = chatExtras(plan, context, []);
  const other = (title: string) => [...extras.others].find(([, row]) => row.title === title)![0];
  const parse = (items: unknown[]) => parseChatReply(reply(items), plan, extras);

  it("offers the projects and their sections as places", () => {
    expect(chatFacts(plan, new Map(), extras, false).projects).toEqual([
      { ref: "p1", name: "Work", sections: [] }, { ref: "p2", name: "Health", sections: [{ ref: "s1", name: "Gym" }] },
    ]);
  });

  it("completes and deletes any open task by ref, as the user asked", () => {
    const draft = parse([item("complete", { task: "t2" }), item("delete", { task: other("Report") })]).draft!;
    expect(draft.items.map(row => [row.op, row.taskId, row.title, row.seenUpdatedAt])).toEqual([["complete", "run", "run", now], ["delete", "report", "Report", now]]);
  });

  it("moves a task to a day without a time, to a place keeping its date, or to a time on the week", () => {
    const draft = parse([
      item("move", { task: other("Report"), day: "2026-02-12" }),
      item("move", { task: "t2", project: "p2", section: "s1" }),
      item("move", { task: "t1", day: "2026-02-10", start: "16:00", minutes: 60, project: "p1" }),
    ]).draft!;
    expect(draft.items.map(row => [row.op, row.taskId, row.startAt.toISOString(), row.endAt?.toISOString() ?? null, row.place ?? null])).toEqual([
      ["move", "report", "2026-02-11T23:00:00.000Z", null, null],
      ["move", "run", now.toISOString(), null, { projectId: "health", sectionId: "gym", label: "Health › Gym", keepsDate: true }],
      ["move", "talk", "2026-02-10T15:00:00.000Z", "2026-02-10T16:00:00.000Z", { projectId: "work", sectionId: null, label: "Work" }],
    ]);
  });

  it("times a task that is not on the schedule as a move", () => {
    const [moved] = parse([item("move", { task: other("Report"), day: "2026-02-11", start: "09:00", minutes: 30, project: "inbox" })]).draft!.items;
    expect(moved).toMatchObject({ op: "move", taskId: "report", startAt: new Date("2026-02-11T08:00:00Z"), place: { projectId: null, label: "Inbox" } });
  });

  it.each([
    ["a fixed (ritual) task", [item("complete", { task: other("Check-in") })], /cannot change/],
    ["an unknown task", [item("delete", { task: "t99" })], /cannot change t99/],
    ["a new task", [item("complete", { title: "x" })], /cannot change a new task/],
    ["the same task twice", [item("complete", { task: "t2" }), item("delete", { task: "t2" })], /t2 appears twice/],
    ["a move without a day or place", [item("move", { task: "t2" })], /nowhere/],
    ["an unknown place", [item("move", { task: "t2", project: "p9" })], /place p9/],
    ["a section of another project", [item("move", { task: "t2", project: "p1", section: "s1" })], /place s1/],
    ["a day in the past", [item("move", { task: "t2", day: "2026-02-01" })], /day "2026-02-01"/],
  ])("drops the draft for %s", (_, items, why) => {
    const result = parse(items);
    expect(result.draft).toBeNull();
    expect(result.reply).toMatch(why);
  });
});

describe("horizons (ticket 31)", () => {
  const context = { tasks: [task("run"), task("parked", { title: "Taxes", horizon: "later" }), task("ritual", { title: "Check-in" })], fixedTaskIds: ["ritual"] };
  const extras = chatExtras(plan, context, []);
  const other = (title: string) => [...extras.others].find(([, row]) => row.title === title)![0];
  const parse = (items: unknown[]) => parseChatReply(reply(items), plan, extras);

  it("marks Later tasks in the facts and asks for a horizon on every item", () => {
    expect(chatFacts(plan, new Map(), extras, false).tasks.find(row => row.title === "Taxes")).toMatchObject({ later: true });
    expect((chatSchema.schema as { properties: { items: { items: { required: string[] } } } }).properties.items.items.required).toContain("horizon");
  });

  it("re-sorts any open task by ref, counted as re-sorted", () => {
    const result = parse([item("horizon", { task: "t2", horizon: "later" }), item("horizon", { task: other("Taxes"), horizon: "now" })]);
    expect(result.draft!.items.map(row => [row.op, row.taskId, row.horizon, row.seenUpdatedAt])).toEqual([["horizon", "run", "later", now], ["horizon", "parked", "now", now]]);
    expect(result.reply).toContain("Proposed: 2 re-sorted.");
  });

  it.each([
    ["an unknown horizon", [item("horizon", { task: "t2", horizon: "someday" })], /horizon "someday"/],
    ["no horizon", [item("horizon", { task: "t2" })], /horizon ""/],
    ["a fixed task", [item("horizon", { task: other("Check-in"), horizon: "later" })], /cannot change/],
    ["the same task twice", [item("horizon", { task: "t2", horizon: "now" }), item("complete", { task: "t2" })], /t2 appears twice/],
  ])("drops the draft for %s", (_, items, why) => {
    const result = parse(items);
    expect(result.draft).toBeNull();
    expect(result.reply).toMatch(why);
  });
});

describe("stale tasks (ticket 32)", () => {
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60_000);
  const old = { updatedAt: days(45) };

  it("are open, top-level, undated, not Later and untouched for 30+ days (a Keep or a sub-task's edit touches), oldest first", () => {
    const tasks = [
      task("fresh", { updatedAt: days(29) }),
      task("month", { updatedAt: days(30) }),
      task("oldest", { updatedAt: days(90) }),
      task("done", { ...old, status: "done" }),
      task("dated", { ...old, dueDate: now }),
      task("parked", { ...old, horizon: "later" }),
      task("kept", { ...old, reviewedAt: days(3) }),
      task("parent", old), task("step", { parentId: "parent", updatedAt: days(2) }),
      task("quiet parent", old), task("quiet step", { parentId: "quiet parent", updatedAt: days(60) }),
    ];
    expect(staleTasks(tasks, now).map(({ task, days }) => [task.id, days])).toEqual([["oldest", 90], ["quiet parent", 45], ["month", 30]]);
  });

  const context = {
    tasks: [task("run"), task("dup", { ...old, title: "Buy milk" }), task("fitness", { ...old, title: "Stretch", projectId: "health" }), task("recent", { title: "Recent" })],
    goals: [{ goalId: "fit", title: "Fit", tier: "primary" as const }],
    links: { projects: [{ goalId: "fit", projectId: "health" }], tasks: [] },
    destinations: { projects: [{ id: "health", name: "Health" }, { id: "home", name: "Home" }], sections: [] },
  };
  const tidyPlan = weekPlan({ zone, now, start: "2026-02-09", context: { ...context, fixedTaskIds: [] } });
  const extras = chatExtras(tidyPlan, context, [], [], true);
  const refOf = (title: string) => [...extras.tidy!.tasks].find(([, entry]) => entry.task.title === title)![0];
  const parse = (items: unknown[]) => parseChatReply(reply(items), tidyPlan, extras);

  it("recognises the request and lists the stale tasks with age, project, goal and priority", () => {
    expect(["Tidy up my backlog", "could you tidy my tasks?"].map(tidyIntent)).toEqual([true, true]);
    expect(tidyIntent("Plan my week")).toBe(false);
    expect(chatFacts(tidyPlan, new Map(), extras, false).stale).toEqual({ shown: 2, total: 2, tasks: [
      { ref: refOf("Buy milk"), title: "Buy milk", days: 45, project: null, goal: null, priority: 4 },
      { ref: refOf("Stretch"), title: "Stretch", days: 45, project: "Health", goal: "g1", priority: 4 },
    ] });
    expect(chatFacts(tidyPlan, new Map(), chatExtras(tidyPlan, context, []), false)).not.toHaveProperty("stale");
  });

  it("drafts one change per stale task: park, delete, complete, move, keep", () => {
    const draft = parse([
      item("delete", { task: refOf("Buy milk") }),
      item("horizon", { task: refOf("Stretch"), horizon: "later" }),
    ]).draft!;
    expect(draft.items.map(row => [row.op, row.taskId])).toEqual([["delete", "dup"], ["horizon", "fitness"]]);
    expect(parse([item("keep", { task: refOf("Stretch") }), item("move", { task: refOf("Buy milk"), project: "p2" })]).draft!.items.map(row => [row.op, row.taskId, row.place?.label ?? null]))
      .toEqual([["keep", "fitness", null], ["move", "dup", "Home"]]);
  });

  it.each([
    ["a task that is not stale", [item("complete", { task: "RUN" })], /only the stale tasks/],
    ["a new task", [item("add", { title: "New", day: "2026-02-10" })], /only the stale tasks/],
    ["deleting primary-goal work", [item("delete", { task: "STRETCH" })], /deleting primary-goal work/],
    ["a move to a day", [item("move", { task: "MILK", day: "2026-02-10" })], /to a project, not a day/],
  ])("drops the draft for %s", (_, items, why) => {
    const run = [...tidyPlan.toPlan].find(([, entry]) => entry.task.id === "run")![0];
    const named = (items as { task: string }[]).map(row => ({ ...row, task: { STRETCH: refOf("Stretch"), MILK: refOf("Buy milk"), RUN: run }[row.task] ?? row.task }));
    const result = parse(named);
    expect(result.draft).toBeNull();
    expect(result.reply).toMatch(why);
  });

  it("keeps only in a tidy-up", () => {
    expect(parseChatReply(reply([item("keep", { task: "t1" })]), plan).reply).toMatch(/keeping t1/);
  });
});

describe("chatMessages", () => {
  it("puts the prompt and facts first, then the last 20 turns and the new message", () => {
    const history = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `m${index}` }));
    const messages = chatMessages({ facts: true } as never, history, "now?");
    expect(messages.slice(0, 2).map(message => message.role)).toEqual(["system", "system"]);
    expect(messages[1]!.content).toBe('Facts: {"facts":true}');
    expect(messages.slice(2, -1).map(message => message.content)).toEqual(history.slice(5).map(message => message.content));
    expect(messages.at(-1)).toEqual({ role: "user", content: "now?" });
  });

  it("ticket 29: sends images with the new message", () => {
    const image = { mediaType: "image/png", data: "aGk=" };
    expect(chatMessages({} as never, [], "what is this?", [image]).at(-1)).toEqual({ role: "user", content: "what is this?", images: [image] });
  });
});
