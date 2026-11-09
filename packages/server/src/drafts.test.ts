import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import {
  dayPlan, dayPlanFacts, draftCounts, draftCurrent, overflowDraft, parseDayDraft, parseWeekDraft, planAccept, planDecline, staleItems, toDraftDto, weekDraftStart, weekPlan, weekPlanFacts,
  type DayContext, type DraftRecord, type DraftTask,
} from "./drafts";

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

describe("calendar events and overflow (ticket 28)", () => {
  const events = [
    { title: "Dentist", start: at("2026-02-09T12:00:00Z"), end: at("2026-02-09T13:00:00Z"), allDay: false }, // 13:00-14:00
    { title: "Late call", start: at("2026-02-09T22:30:00Z"), end: at("2026-02-10T00:00:00Z"), allDay: false }, // 23:30, into tomorrow
    { title: "Holiday", start: at("2026-02-09T00:00:00Z"), end: at("2026-02-11T00:00:00Z"), allDay: true },
    { title: "Tomorrow", start: at("2026-02-10T09:00:00Z"), end: at("2026-02-10T10:00:00Z"), allDay: false },
  ];
  const plan = dayPlan({ now, zone, context: context([task("run", { dueDate: at("2026-02-05T23:00:00Z") })], { events }) });
  const item = (extra: Record<string, unknown>) => ({ op: "add", task: "", title: "", start: "", minutes: 0, goal: "", reason: "Because.", ...extra });
  const parse = (items: unknown[], overflow?: unknown[]) => parseDayDraft(JSON.stringify({ summary: "x", items, ...(overflow && { overflow }) }), plan);

  it("keeps the day's timed events (clipped to it) as busy times, titles only when shared", () => {
    expect(dayPlanFacts(plan)).toMatchObject({ events: [{ start: "13:00", minutes: 60 }, { start: "23:30", minutes: 30 }], allDayEvents: [{}] });
    const shared = dayPlan({ now, zone, context: context([], { events, shareEventTitles: true }) });
    expect(dayPlanFacts(shared)).toMatchObject({ events: [{ title: "Dentist" }, { title: "Late call" }], allDayEvents: [{ title: "Holiday" }] });
    expect(weekPlanFacts(weekPlan({ now, zone, start: "2026-02-09", context: context([], { events }) }))).toMatchObject({
      events: [{ day: "2026-02-09", start: "13:00" }, { day: "2026-02-09", start: "23:30", minutes: 90 }, { day: "2026-02-10", start: "10:00" }],
      allDayEvents: [{ day: "2026-02-09" }, { day: "2026-02-10" }],
    });
  });

  it("rejects an item over a timed event; all-day events block nothing", () => {
    expect(() => parse([item({ title: "Clash", start: "13:45", minutes: 30 })])).toThrow("calendar event");
    expect(parse([item({ title: "Fits", start: "14:00", minutes: 30 })]).items).toHaveLength(1);
  });

  it("returns overflow (a task to plan or a new one) unplaced, and none when everything fits", () => {
    const run = [...plan.toPlan.values()][0]!.ref;
    const draft = parse([], [{ task: run, title: "", minutes: 45, goal: "", reason: "No room." }, { task: "", title: "Stretch", minutes: 5, goal: "g1", reason: "No room." }]);
    expect(draft.items).toEqual([]);
    expect(draft.overflow).toEqual([
      { taskId: "run", title: "run", minutes: 45, goalId: "fit", reason: "No room.", seenUpdatedAt: v1.toISOString() },
      { taskId: null, title: "Stretch", minutes: 15, goalId: "fit", reason: "No room.", seenUpdatedAt: null },
    ]);
    expect(parse([]).overflow).toBeUndefined();
    expect(() => parse([item({ task: run, start: "14:00", minutes: 30 })], [{ task: run, title: "", minutes: 30, goal: "", reason: "" }])).toThrow(CoachModelError);
    expect(() => parse([], [{ task: "t99", title: "", minutes: 30, goal: "", reason: "" }])).toThrow(CoachModelError);
    expect(() => parse([], [{ task: "", title: " ", minutes: 30, goal: "", reason: "" }])).toThrow(CoachModelError);
  });

  it("schedules the overflow on the first later day with room, around tasks and events, a break after each", () => {
    const busy = [{ title: "Offsite", start: at("2026-02-10T07:00:00Z"), end: at("2026-02-10T21:00:00Z"), allDay: false }, { title: "Standup", start: at("2026-02-11T07:00:00Z"), end: at("2026-02-11T07:20:00Z"), allDay: false }];
    const overflow = [
      { taskId: "run", title: "run", minutes: 45, goalId: "fit", reason: "No room.", seenUpdatedAt: v1.toISOString() },
      { taskId: null, title: "Stretch", minutes: 15, goalId: null, reason: "No room.", seenUpdatedAt: null },
    ];
    const tasks = [task("run"), task("block", { dueDate: at("2026-02-11T08:00:00Z"), dueDateEnd: at("2026-02-11T09:00:00Z") })];
    const next = overflowDraft({ draft: { kind: "day", period: "2026-02-09", overflow }, context: context(tasks, { events: busy }), zone, now });
    expect(next).toMatchObject({ kind: "day", period: "2026-02-11" });
    // Standup ends 08:20: 08:30 until the 09:00 block is too short for the run (10:00 then) but fits Stretch.
    expect(next !== "full" && next!.items.map(row => [row.taskId, row.startAt.toISOString(), row.endAt!.toISOString(), row.seenUpdatedAt])).toEqual([
      ["run", "2026-02-11T09:00:00.000Z", "2026-02-11T09:45:00.000Z", v1],
      [null, "2026-02-11T07:30:00.000Z", "2026-02-11T07:45:00.000Z", null],
    ]);
    // A task done since is left out; nothing left is null; no room at all is "full".
    expect(overflowDraft({ draft: { kind: "day", period: "2026-02-09", overflow: overflow.slice(0, 1) }, context: context([task("run", { status: "done" })]), zone, now })).toBeNull();
    const away = [{ title: "Away", start: at("2026-02-09T00:00:00Z"), end: at("2026-03-01T00:00:00Z"), allDay: false }];
    expect(overflowDraft({ draft: { kind: "day", period: "2026-02-09", overflow }, context: context(tasks, { events: away }), zone, now })).toBe("full");
    // A week's overflow goes after its last day.
    expect(overflowDraft({ draft: { kind: "week", period: "2026-02-09", overflow }, context: context(tasks), zone, now })).toMatchObject({ period: "2026-02-16" });
  });

  it("shows overflow on the draft only while there is some", () => {
    const record = { id: "d", kind: "day" as const, period: "2026-02-09", summary: "", createdAt: now, items: [] };
    expect(toDraftDto({ ...record, overflow: [{ taskId: "run", title: "run", minutes: 45, goalId: null, reason: "No room.", seenUpdatedAt: null }] }).overflow).toEqual([{ title: "run", minutes: 45, reason: "No room." }]);
    expect(toDraftDto({ ...record, overflow: null })).not.toHaveProperty("overflow");
  });
});

describe("weekPlan (ticket 20)", () => {
  // This week from Monday 9 Feb; "side" is secondary-goal work (project link), "run" primary.
  const plan = weekPlan({ now, zone, start: "2026-02-09", context: context([
    task("inbox"),
    task("run", { dueDate: at("2026-02-05T23:00:00Z") }), // overdue
    task("side", { projectId: "p-side", dueDate: at("2026-02-10T17:00:00Z"), dueDateEnd: at("2026-02-10T19:00:00Z") }), // Tue 18:00-20:00
    task("later", { dueDate: at("2026-02-12T23:00:00Z") }), // due Fri, no time
    task("next-week", { dueDate: at("2026-02-16T23:00:00Z") }),
    task("weekly-review", { dueDate: at("2026-02-15T17:00:00Z") }), // Sun 18:00, ritual
    task("done", { status: "done", dueDate: at("2026-02-11T09:00:00Z") }),
  ], { fixedTaskIds: ["weekly-review"] }) });
  const facts = weekPlanFacts(plan);

  it("plans the week's days with its timed tasks and the minutes each goal already has", () => {
    expect(facts.days.map(day => `${day.day} ${day.weekday}`)).toEqual([
      "2026-02-09 Monday", "2026-02-10 Tuesday", "2026-02-11 Wednesday", "2026-02-12 Thursday", "2026-02-13 Friday", "2026-02-14 Saturday", "2026-02-15 Sunday",
    ]);
    expect(facts.scheduled.map(entry => [entry.title, entry.day, entry.start, entry.minutes, entry.goal, entry.fixed])).toEqual([
      ["side", "2026-02-10", "18:00", 120, "g2", false], ["weekly-review", "2026-02-15", "18:00", 30, null, true],
    ]);
    expect(facts.goals).toEqual([
      { ref: "g1", title: "Become fit", tier: "primary", scheduledMinutes: 0 }, { ref: "g2", title: "Side project", tier: "secondary", scheduledMinutes: 120 },
    ]);
  });

  it("lists overdue, due-this-week and Inbox tasks, goal tasks first; nothing beyond the week", () => {
    expect(facts.toPlan.map(entry => [entry.title, entry.waiting, entry.due, entry.goal])).toEqual([
      ["run", "overdue", "2026-02-06", "g1"], ["later", "due", "2026-02-13", null], ["inbox", "inbox", null, null],
    ]);
  });

  it.each([
    ["a week already over", "2026-02-02", []],
    ["a week under way: from today on", "2026-02-07", ["2026-02-09", "2026-02-10", "2026-02-11", "2026-02-12", "2026-02-13"]],
  ])("leaves past days out for %s", (_name, start, days) => expect(weekPlan({ now, zone, start, context: context([]) }).days).toEqual(days));
});

describe("parseWeekDraft", () => {
  const plan = weekPlan({ now, zone, start: "2026-02-09", context: context([
    task("run", { dueDate: at("2026-02-05T23:00:00Z") }),
    task("side", { projectId: "p-side", dueDate: at("2026-02-10T17:00:00Z"), dueDateEnd: at("2026-02-10T19:00:00Z") }),
    task("gym", { dueDate: at("2026-02-11T06:00:00Z"), dueDateEnd: at("2026-02-11T07:00:00Z") }), // Wed 07:00-08:00
  ], { links: { projects: [{ goalId: "side", projectId: "p-side" }], tasks: [{ goalId: "fit", taskId: "run" }, { goalId: "fit", taskId: "gym" }] } }) });
  const ref = (title: string) => [...plan.scheduled.values(), ...plan.toPlan.values()].find(entry => entry.task.title === title)!.ref;
  const item = (op: string, extra: Record<string, unknown> = {}) => ({ op, task: "", title: "", day: "", start: "", minutes: 0, goal: "", reason: "Because.", ...extra });
  const parse = (items: unknown[]) => parseWeekDraft(JSON.stringify({ summary: "Primary first.", items }), plan);
  const real = (items: unknown[]) => JSON.parse(JSON.stringify(items).replaceAll("RUN", ref("run")).replaceAll("SIDE", ref("side")).replaceAll("GYM", ref("gym")));

  it("places items on their own days; dropping secondary work keeps its day; postponing moves it later", () => {
    const draft = parse(real([
      item("add", { task: "RUN", day: "2026-02-10", start: "07:00", minutes: 45 }),
      item("move", { task: "SIDE", day: "2026-02-13", start: "18:00", minutes: 60 }),
      item("add", { title: "Long run", day: "2026-02-14", start: "09:00", minutes: 90, goal: "g1" }),
    ]));
    expect(draft.items.map(row => [row.op, row.taskId, row.startAt.toISOString(), row.endAt?.toISOString(), row.goalId])).toEqual([
      ["add", "run", "2026-02-10T06:00:00.000Z", "2026-02-10T06:45:00.000Z", "fit"],
      ["move", "side", "2026-02-13T17:00:00.000Z", "2026-02-13T18:00:00.000Z", "side"],
      ["add", null, "2026-02-14T08:00:00.000Z", "2026-02-14T09:30:00.000Z", "fit"],
    ]);
    expect(parse(real([item("remove", { task: "SIDE" })])).items[0]).toMatchObject({ op: "remove", taskId: "side", startAt: at("2026-02-09T23:00:00Z"), endAt: null });
  });

  it("lets primary-goal work move to another day at its full length", () =>
    expect(parse(real([item("move", { task: "GYM", day: "2026-02-12", start: "07:00", minutes: 60 })])).items).toHaveLength(1));

  it.each([
    ["removing primary-goal work", [item("remove", { task: "GYM" })]],
    ["shortening primary-goal work", [item("move", { task: "GYM", day: "2026-02-11", start: "07:00", minutes: 30 })]],
    ["a day outside the week", [item("add", { task: "RUN", day: "2026-02-16", start: "10:00", minutes: 30 })]],
    ["no day", [item("add", { task: "RUN", start: "10:00", minutes: 30 })]],
    ["a time today that has passed", [item("add", { task: "RUN", day: "2026-02-09", start: "08:00", minutes: 30 })]],
    ["past midnight of its day", [item("add", { task: "RUN", day: "2026-02-12", start: "23:30", minutes: 60 })]],
    ["overlapping a kept task on its day", [item("add", { task: "RUN", day: "2026-02-11", start: "07:30", minutes: 30 })]],
    ["the same task twice", [item("add", { task: "RUN", day: "2026-02-10", start: "07:00", minutes: 30 }), item("add", { task: "RUN", day: "2026-02-11", start: "12:00", minutes: 30 })]],
  ])("rejects the whole draft for %s", (_name, items) => expect(() => parse(real(items))).toThrow(/did not fit your week/));
});

describe("week draft periods", () => {
  it.each([
    ["next week", "2026-02-16", "2026-02-16"],
    ["this week, under way", "2026-02-03", "2026-02-03"],
    ["a week already over", "2026-02-02", null],
    ["too far ahead", "2026-03-10", null],
    ["not a date", "2026-02-30", null],
    ["malformed", "16/02/2026", null],
    ["missing", null, null],
  ])("accepts %s as a week start or not", (_name, start, expected) => expect(weekDraftStart(start, "2026-02-09")).toBe(expected));

  it.each([
    ["day", "2026-02-09", true], ["day", "2026-02-08", false],
    ["week", "2026-02-03", true], ["week", "2026-02-02", false],
  ] as const)("a %s draft of %s is current: %s", (kind, period, expected) => expect(draftCurrent({ kind, period }, "2026-02-09")).toBe(expected));
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

  it("ticket 30: names only the stale items among the chosen ones", () => {
    expect(staleItems(draft, undefined, current)).toEqual([]);
    expect(staleItems(draft, undefined, [task("run", { status: "done" })])).toEqual(draft.items.filter(item => item.state === "pending" && item.taskId).map(item => item.id));
    expect(staleItems(draft, ["x"], [])).toEqual([]);
  });

  it("declines the pending items, or the chosen ones", () => {
    expect(planDecline(draft, undefined)).toEqual(["i1", "i2"]);
    expect(planDecline(draft, ["i1"])).toEqual(["i1"]);
    expect(planDecline(draft, ["i3"])).toBe("missing");
  });

  it("counts what is still to decide", () => {
    expect(draftCounts(draft.items)).toBe("2 added");
    expect(draftCounts([{ op: "add", state: "pending" }, { op: "move", state: "pending" }, { op: "remove", state: "pending" }, { op: "add", state: "pending" }])).toBe("2 added, 1 moved, 1 removed");
    expect(draftCounts([{ op: "subtask", state: "pending" }, { op: "subtask", state: "pending" }, { op: "attach", state: "pending" }, { op: "subtask", state: "declined" }])).toBe("2 sub-tasks, 1 attached");
    expect(draftCounts([{ op: "complete", state: "pending" }, { op: "move", state: "pending" }, { op: "delete", state: "pending" }, { op: "complete", state: "pending" }])).toBe("1 moved, 2 completed, 1 deleted");
  });
});

describe("sub-tasks and attachments (ticket 29)", () => {
  const base = { startAt: now, endAt: null, goalId: null, reason: "", seenUpdatedAt: null, state: "pending" as const };
  const draft: DraftRecord = {
    id: "d2", kind: "chat", period: "2026-02-09", summary: "", createdAt: now,
    items: [
      { ...base, id: "new", op: "add", taskId: null, title: "Essay", startAt: at("2026-03-01T23:00:00Z") },
      { ...base, id: "step", op: "subtask", taskId: null, title: "Outline", parentItemId: "new" },
      { ...base, id: "file", op: "attach", taskId: null, title: "syllabus.pdf", parentId: "run", documentId: "doc" },
      { ...base, id: "sub", op: "subtask", taskId: null, title: "Warm up", parentId: "run" },
    ],
  };
  const ids = (writes: ReturnType<typeof planAccept>) => Array.isArray(writes) ? writes.map(write => write.itemId) : writes;

  it("accepts a sub-task with its new parent task first, in the draft's order", () => {
    expect(ids(planAccept(draft, ["step"], [task("run")]))).toEqual(["new", "step"]);
    expect(planAccept(draft, ["file"], [task("run")])).toEqual([expect.objectContaining({ itemId: "file", op: "attach", parentId: "run", documentId: "doc" })]);
  });

  it("only needs an existing parent open: an edit to it does not matter, done or deleted does", () => {
    expect(ids(planAccept(draft, ["sub"], [task("run", { updatedAt: now })]))).toEqual(["sub"]);
    expect(planAccept(draft, ["sub"], [task("run", { status: "done" })])).toBe("changed");
    expect(planAccept(draft, ["file"], [])).toBe("changed");
  });

  it("declining a new task declines what goes under it; its children cannot be accepted after", () => {
    expect(planDecline(draft, ["new"])).toEqual(["new", "step"]);
    const declined = { ...draft, items: draft.items.map(item => item.id === "new" ? { ...item, state: "declined" as const } : item) };
    expect(planAccept(declined, ["step"], [task("run")])).toBe("missing");
  });
});
