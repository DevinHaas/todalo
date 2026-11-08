import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { dayPlan, dayPlanFacts, draftCounts, parseDayDraft, planAccept, planDecline, type DayContext, type DraftRecord, type DraftTask } from "./drafts";

// Zurich, Monday 9 Feb 2026, 09:10 local (08:10 UTC).
const zone = "Europe/Zurich";
const now = new Date("2026-02-09T08:10:00Z");
const v1 = new Date("2026-02-01T00:00:00Z");
const task = (id: string, extra: Partial<DraftTask> = {}): DraftTask =>
  ({ id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: v1, ...extra });
const at = (iso: string) => new Date(iso);
const context = (tasks: DraftTask[], extra: Partial<DayContext> = {}): DayContext => ({
  tasks, fixedTaskIds: [],
  goals: [{ goalId: "side", title: "Side project", tier: "secondary" }, { goalId: "fit", title: "Become fit", tier: "primary" }],
  links: { projects: [{ goalId: "side", projectId: "p-side" }], tasks: [{ goalId: "fit", taskId: "run" }] },
  ...extra,
});

describe("dayPlan", () => {
  const plan = dayPlan({ now, zone, context: context([
    task("inbox"),
    task("in-project", { projectId: "p-other" }),
    task("side", { projectId: "p-side", dueDate: at("2026-02-08T23:00:00Z") }), // due today (local midnight)
    task("run", { dueDate: at("2026-02-05T23:00:00Z") }), // overdue
    task("meeting", { dueDate: at("2026-02-09T09:00:00Z"), dueDateEnd: at("2026-02-09T10:00:00Z") }), // 10:00-11:00 today
    task("check-in", { dueDate: at("2026-02-09T08:00:00Z") }),
    task("later", { dueDate: at("2026-02-12T23:00:00Z") }), // due Fri
    task("far", { dueDate: at("2026-03-01T23:00:00Z") }),
    task("tomorrow-timed", { dueDate: at("2026-02-10T09:00:00Z") }),
    task("done", { status: "done", dueDate: at("2026-02-08T23:00:00Z") }),
  ], { fixedTaskIds: ["check-in"] }) });
  const facts = dayPlanFacts(plan);

  it("lists what the Plan sidebar lists, goal tasks first (primary before secondary), with refs instead of IDs", () => {
    expect(facts.toPlan.map(entry => [entry.title, entry.waiting, entry.goal])).toEqual([
      ["run", "overdue", "g1"], ["side", "due today", "g2"], ["later", "due this week", null], ["inbox", "inbox", null],
    ]);
    expect(facts.goals).toEqual([{ ref: "g1", title: "Become fit", tier: "primary" }, { ref: "g2", title: "Side project", tier: "secondary" }]);
    expect(JSON.stringify(facts)).not.toContain("p-side");
  });

  it("shows today's timed tasks in local time; ritual items are fixed", () => {
    expect(facts).toMatchObject({ day: "2026-02-09", weekday: "Monday", now: "09:10" });
    expect(facts.scheduled.map(entry => [entry.title, entry.start, entry.minutes, entry.fixed])).toEqual([["check-in", "09:00", 30, true], ["meeting", "10:00", 60, false]]);
  });
});

describe("parseDayDraft", () => {
  const plan = dayPlan({ now, zone, context: context([
    task("run", { dueDate: at("2026-02-05T23:00:00Z") }),
    task("meeting", { dueDate: at("2026-02-09T09:00:00Z"), dueDateEnd: at("2026-02-09T10:00:00Z"), updatedAt: at("2026-02-08T12:00:00Z") }),
    task("check-in", { dueDate: at("2026-02-09T08:00:00Z") }),
  ], { fixedTaskIds: ["check-in"] }) });
  const ref = (title: string) => [...plan.scheduled.values(), ...plan.toPlan.values()].find(entry => entry.task.title === title)!.ref;
  const item = (op: string, extra: Record<string, unknown> = {}) => ({ op, task: "", title: "", start: "", minutes: 0, goal: "", reason: "Because.", ...extra });
  const parse = (items: unknown[]) => parseDayDraft(JSON.stringify({ summary: "  Protect   the run. ", items }), plan);

  it("turns a valid reply into items with the tasks' new times", () => {
    const draft = parse([
      item("add", { task: ref("run"), start: "11:00", minutes: 45 }),
      item("move", { task: ref("meeting"), start: "14:00", minutes: 60 }),
      item("add", { title: "Stretch", start: "18:00", minutes: 15, goal: "g1" }),
    ]);
    expect(draft.summary).toBe("Protect the run.");
    expect(draft.items).toEqual([
      { op: "add", taskId: "run", title: "run", startAt: at("2026-02-09T10:00:00Z"), endAt: at("2026-02-09T10:45:00Z"), goalId: "fit", reason: "Because.", seenUpdatedAt: v1 },
      { op: "move", taskId: "meeting", title: "meeting", startAt: at("2026-02-09T13:00:00Z"), endAt: at("2026-02-09T14:00:00Z"), goalId: null, reason: "Because.", seenUpdatedAt: at("2026-02-08T12:00:00Z") },
      { op: "add", taskId: null, title: "Stretch", startAt: at("2026-02-09T17:00:00Z"), endAt: at("2026-02-09T17:15:00Z"), goalId: "fit", reason: "Because.", seenUpdatedAt: null },
    ]);
  });

  it("removes a scheduled task to its day (local midnight, no end)", () => {
    expect(parse([item("remove", { task: ref("meeting") })]).items[0]).toMatchObject({ op: "remove", taskId: "meeting", startAt: at("2026-02-08T23:00:00Z"), endAt: null });
  });

  it("a moved task frees its old slot", () => {
    expect(parse([item("move", { task: ref("meeting"), start: "12:00", minutes: 60 }), item("add", { task: ref("run"), start: "10:00", minutes: 60 })]).items).toHaveLength(2);
  });

  it.each([
    ["not JSON", "nope"],
    ["wrong shape", JSON.stringify({ items: [] })],
  ])("rejects %s", (_name, content) => expect(() => parseDayDraft(content, plan)).toThrow(CoachModelError));

  it.each([
    ["an unknown task ref", [item("add", { task: "t99", start: "11:00", minutes: 30 })]],
    ["moving a task that is not scheduled", [item("move", { task: "RUN", start: "11:00", minutes: 30 })]],
    ["moving a fixed ritual item", [item("move", { task: "CHECK", start: "11:00", minutes: 30 })]],
    ["removing a new task", [item("remove")]],
    ["the same task twice", [item("add", { task: "RUN", start: "11:00", minutes: 30 }), item("add", { task: "RUN", start: "12:00", minutes: 30 })]],
    ["a time that has passed", [item("add", { task: "RUN", start: "08:00", minutes: 30 })]],
    ["midnight (would read as all day)", [item("add", { task: "RUN", start: "00:00", minutes: 30 })]],
    ["a malformed time", [item("add", { task: "RUN", start: "9:30", minutes: 30 })]],
    ["too short", [item("add", { task: "RUN", start: "11:00", minutes: 5 })]],
    ["past midnight", [item("add", { task: "RUN", start: "23:30", minutes: 60 })]],
    ["overlapping a kept task", [item("add", { task: "RUN", start: "10:30", minutes: 30 })]],
    ["overlapping a fixed item", [item("add", { task: "RUN", start: "09:15", minutes: 30 })]],
    ["overlapping each other", [item("add", { task: "RUN", start: "12:00", minutes: 60 }), item("add", { title: "New", start: "12:30", minutes: 30 })]],
    ["a new task without a title", [item("add", { start: "12:00", minutes: 30 })]],
    ["an unknown goal", [item("add", { title: "New", start: "12:00", minutes: 30, goal: "g9" })]],
    ["too many changes", Array.from({ length: 21 }, (_, index) => item("add", { title: `New ${index}`, start: "12:00", minutes: 15 }))],
  ])("rejects the whole draft for %s", (_name, items) => {
    const real = JSON.parse(JSON.stringify(items).replaceAll("RUN", ref("run")).replaceAll("CHECK", ref("check-in")));
    expect(() => parse(real)).toThrow(CoachModelError);
  });

  it("an empty draft is valid (nothing to change)", () => expect(parse([]).items).toEqual([]));
});

describe("accepting and declining", () => {
  const draft: DraftRecord = {
    id: "d1", kind: "day", period: "2026-02-09", summary: "", createdAt: now,
    items: [
      { id: "i1", op: "add", taskId: "run", title: "run", startAt: at("2026-02-09T10:00:00Z"), endAt: at("2026-02-09T10:30:00Z"), goalId: "fit", reason: "", seenUpdatedAt: v1, state: "pending" },
      { id: "i2", op: "add", taskId: null, title: "Stretch", startAt: at("2026-02-09T17:00:00Z"), endAt: at("2026-02-09T17:15:00Z"), goalId: null, reason: "", seenUpdatedAt: null, state: "pending" },
      { id: "i3", op: "remove", taskId: "old", title: "old", startAt: at("2026-02-08T23:00:00Z"), endAt: null, goalId: null, reason: "", seenUpdatedAt: v1, state: "declined" },
    ],
  };
  const current = [task("run"), task("old")];

  it.each([
    ["every pending item", undefined, ["i1", "i2"]],
    ["one item", ["i2"], ["i2"]],
  ])("accepts %s", (_name, ids, expected) => {
    const writes = planAccept(draft, ids, current);
    expect(Array.isArray(writes) && writes.map(write => write.itemId)).toEqual(expected);
  });

  it.each([
    ["a decided item", ["i3"], "missing"],
    ["another draft's item", ["x"], "missing"],
  ])("refuses %s", (_name, ids, expected) => expect(planAccept(draft, ids, current)).toBe(expected));

  it.each([
    ["edited since", [task("run", { updatedAt: now })]],
    ["completed since", [task("run", { status: "done" })]],
    ["deleted since", []],
  ])("writes nothing when a task was %s", (_name, tasks) => expect(planAccept(draft, undefined, tasks)).toBe("changed"));

  it("declines the pending items, or the chosen ones", () => {
    expect(planDecline(draft, undefined)).toEqual(["i1", "i2"]);
    expect(planDecline(draft, ["i1"])).toEqual(["i1"]);
    expect(planDecline(draft, ["i3"])).toBe("missing");
  });

  it("counts what is still to decide", () => {
    expect(draftCounts(draft.items)).toBe("2 added");
    expect(draftCounts([{ op: "add", state: "pending" }, { op: "move", state: "pending" }, { op: "remove", state: "pending" }, { op: "add", state: "pending" }])).toBe("2 added, 1 moved, 1 removed");
  });
});
