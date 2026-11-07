import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
// Legacy oracle: the Next views compute these with date-fns in the viewer's zone.
import {
  addDays as fnsAddDays, addMonths as fnsAddMonths, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  startOfMonth, startOfWeek as fnsStartOfWeek,
} from "date-fns";
import { navigateViewDate as legacyNavigate } from "../../web/lib/view-navigation";
import type { TaskDto } from "./tasks";
import {
  addDays, addMonths, blockFor, dayKey, dragRange, dropRange, durationOf, goalOf, nextSlot, overlapColumns, scheduledDetails, unscheduledDetails, unscheduledTasks, rangeAt, spanFor, taskItem, eachDay, extendWindow, labels, monthGrid, navigateViewDate, nextLayout, slotAt, tasksByDay,
  upcomingSections, upcomingWindow, weekOf,
} from "./schedule";
import { CalendarView, TodaySchedule, UpcomingList, type ScheduleSlots } from "./schedule-views";
import { TodayView } from "./views";

const originalZone = process.env.TZ;
afterEach(() => { process.env.TZ = originalZone; });
// Node applies a runtime TZ change to Date immediately.
const zones = ["Europe/Zurich", "America/New_York", "Australia/Sydney", "Pacific/Auckland", "UTC"];
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
});
const keys = (days: Date[]) => days.map(dayKey);
// DST changes in 2026: EU 29 Mar / 25 Oct, US 8 Mar / 1 Nov, AU/NZ 5 Apr / 4 Oct (Sydney) 27 Sep (Auckland).
const instants = ["2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z", "2026-11-01T06:30:00Z", "2026-10-03T16:30:00Z", "2026-09-26T14:30:00Z", "2026-12-31T23:30:00Z", "2026-10-04T10:00:00Z"];

describe("schedule date rules match the legacy date-fns views", () => {
  for (const zone of zones) it(`weeks, month grids, windows and navigation in ${zone}`, () => {
    process.env.TZ = zone;
    for (const value of instants) {
      const now = new Date(value);
      expect(keys(weekOf(now))).toEqual(keys(eachDayOfInterval({ start: fnsStartOfWeek(now, { weekStartsOn: 1 }), end: fnsAddDays(fnsStartOfWeek(now, { weekStartsOn: 1 }), 6) })));
      expect(keys(monthGrid(now))).toEqual(keys(eachDayOfInterval({ start: fnsStartOfWeek(startOfMonth(now)), end: endOfWeek(endOfMonth(now)) })));
      const window = upcomingWindow(now);
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      expect(window.start.getTime()).toBe(fnsStartOfWeek(today, { weekStartsOn: 1 }).getTime());
      expect(window.end.getTime()).toBe(addYears(today, 1).getTime());
      expect(eachDay(window.start, window.end)).toHaveLength(eachDayOfInterval(window).length);
      for (const action of ["today", "next-week", "previous-week"] as const) {
        expect(navigateViewDate(now, action, now).getTime()).toBe(legacyNavigate(now, action, now).getTime());
      }
      expect(addMonths(now, -1).getTime()).toBe(fnsAddMonths(now, -1).getTime());
      expect(labels.day(now, now)).toBe(`${format(now, "d MMM")} · Today · ${format(now, "EEEE")}`);
      expect(labels.week(weekOf(now)[0])).toBe(`${format(weekOf(now)[0], "MMM d")} – ${format(weekOf(now)[6], "MMM d, yyyy")}`);
    }
  });

  it("clamps month steps and leap days like date-fns", () => {
    process.env.TZ = "Europe/Zurich";
    expect(dayKey(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(dayKey(upcomingWindow(new Date(2028, 1, 29, 9)).end)).toBe(dayKey(addYears(new Date(2028, 1, 29), 1)));
  });

  it("groups a task by its local day, not its UTC day", () => {
    process.env.TZ = "Pacific/Auckland";
    // 2026-10-04 11:30 UTC is 5 Oct 00:30 in Auckland.
    expect([...tasksByDay([task("late", { dueDate: "2026-10-04T11:30:00.000Z" })], false).keys()]).toEqual(["2026-10-05"]);
    process.env.TZ = "America/New_York";
    expect([...tasksByDay([task("late", { dueDate: "2026-10-05T02:30:00.000Z" })], false).keys()]).toEqual(["2026-10-04"]);
  });

  it("keeps done tasks with a time range on calendars even with completed tasks hidden", () => {
    const slot = { dueDate: "2026-10-05T17:00:00.000Z", dueDateEnd: "2026-10-05T17:45:00.000Z" };
    const ids = (showCompleted: boolean) => [...tasksByDay([
      task("done-slot", { ...slot, status: "done" }), task("done-day", { dueDate: "2026-10-05T00:00:00.000Z", status: "done" }), task("open", slot),
    ], showCompleted).values()].flat().map(item => item.id);
    expect(ids(false)).toEqual(["done-slot", "open"]);
    expect(ids(true)).toEqual(["done-slot", "done-day", "open"]);
  });
});

describe("Upcoming sections", () => {
  it("splits overdue, window days (Monday start) and later tasks, hiding completed ones by default", () => {
    process.env.TZ = "Europe/Zurich";
    const now = new Date(2026, 9, 7, 10); // Wednesday
    const window = upcomingWindow(now);
    const tasks = [
      task("before-window", { dueDate: new Date(2026, 9, 1, 9).toISOString() }),
      task("monday-overdue", { dueDate: new Date(2026, 9, 5, 9).toISOString() }),
      task("child", { parentId: "parent", dueDate: new Date(2026, 9, 7, 8).toISOString() }),
      task("parent", { dueDate: new Date(2026, 9, 7, 12).toISOString() }),
      task("done", { status: "done", dueDate: new Date(2026, 9, 7, 9).toISOString() }),
      task("last-day", { dueDate: new Date(2027, 9, 7, 18).toISOString() }),
      task("later", { dueDate: new Date(2027, 9, 8).toISOString() }),
      task("undated"),
    ];
    const sections = upcomingSections(tasks, window, false, now);
    expect(sections.overdue.map(item => item.id)).toEqual(["before-window"]);
    expect(sections.days[0].key).toBe("2026-10-05");
    expect(sections.days[0].tasks.map(item => item.id)).toEqual(["monday-overdue"]);
    expect(sections.days[2].tasks.map(item => item.id)).toEqual(["parent", "child"]);
    // The last day of the window keeps its own section; only later days go to Later.
    expect(sections.days.at(-1)).toMatchObject({ key: "2027-10-07" });
    expect(sections.days.at(-1)!.tasks.map(item => item.id)).toEqual(["last-day"]);
    expect(sections.later.map(item => item.id)).toEqual(["later"]);
    expect(upcomingSections(tasks, window, true, now).days[2].tasks.map(item => item.id)).toEqual(["parent", "child", "done"]);
  });

  it("has one section per calendar day across the October DST change", () => {
    process.env.TZ = "Europe/Zurich";
    const window = upcomingWindow(new Date(2026, 9, 21, 10));
    const days = upcomingSections([task("after-change", { dueDate: new Date(2026, 9, 26, 0).toISOString() })], window, false).days;
    expect(days.slice(0, 8).map(day => day.key)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(days[7].tasks.map(item => item.id)).toEqual(["after-change"]);
  });

  it("extends the window to a navigated week, like the legacy strip", () => {
    process.env.TZ = "Europe/Zurich";
    const window = upcomingWindow(new Date(2026, 9, 7));
    expect(dayKey(extendWindow(window, new Date(2026, 8, 24)).start)).toBe("2026-09-21");
    expect(dayKey(extendWindow(window, new Date(2027, 9, 20)).end)).toBe("2027-10-24");
    expect(extendWindow(window, new Date(2026, 10, 1))).toEqual(window);
  });
});

describe("schedule grid", () => {
  it("positions timed blocks in local hours through DST and snaps slots to 15 minutes", () => {
    process.env.TZ = "Europe/Zurich";
    // 25 Oct 2026: 09:00–10:30 local on the 25-hour day still sits at 9 × 48px.
    const block = blockFor(new Date(2026, 9, 25, 9).toISOString(), new Date(2026, 9, 25, 10, 30).toISOString());
    expect(block).toMatchObject({ top: 432, height: 72 });
    expect(blockFor(new Date(2026, 9, 25, 9).toISOString(), null).height).toBe(24);
    expect(blockFor(new Date(2026, 9, 25, 23, 50).toISOString(), null).height).toBe(20);
    const slot = slotAt(new Date(2026, 9, 25), 4.5 * 48 + 5);
    expect([labels.time(slot.start), labels.time(slot.end), dayKey(slot.start)]).toEqual(["04:30", "04:45", "2026-10-25"]);
    expect(labels.time(slotAt(new Date(2026, 9, 25), 24 * 48).start)).toBe("23:45");
    expect(isSameDay(slotAt(new Date(2026, 2, 29), 2.5 * 48).start, new Date(2026, 2, 29))).toBe(true);
  });

  it("cycles list, board and calendar layouts both ways (legacy nextLayout)", () => {
    expect(nextLayout("list")).toBe("board");
    expect(nextLayout("board")).toBe("calendar");
    expect(nextLayout("calendar")).toBe("list");
    expect(nextLayout("list", -1)).toBe("calendar");
    expect(nextLayout("board", -1)).toBe("list");
  });
});

describe("schedule views", () => {
  const slots: ScheduleSlots = { row: item => createElement("p", { key: item.id, className: "row" }, item.title), open() {}, complete() {}, remove() {}, slot() {} };
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
  const at = (day: number, hours = 0, minutes = 0) => new Date(2026, 9, day, hours, minutes).toISOString();
  const tasks = [
    task("Overdue review", { dueDate: at(1, 9) }),
    task("All-day plan", { dueDate: at(7) }),
    task("Timed standup", { dueDate: at(7, 9), dueDateEnd: at(7, 10, 30) }),
    task("Done today", { status: "done", dueDate: at(7, 8) }),
    task("Tomorrow call", { dueDate: at(8, 14) }),
  ];

  it("renders Upcoming day sections, the week strip and day composers", () => {
    process.env.TZ = "Europe/Zurich";
    const now = new Date(2026, 9, 7, 10);
    const html = render(createElement(UpcomingList, { tasks, slots, now, composer: day => createElement("i", { key: "c" }, `add ${dayKey(day)}`) }));
    expect(html).toContain('id="2026-10-05"');
    expect(html).toContain("7 Oct · Today · Wednesday");
    expect(html).toContain("8 Oct · Tomorrow · Thursday");
    expect(html).toMatch(/aria-current="date"[^>]*><span>Wed<\/span><span>7<\/span>/);
    expect(html).toContain("Overdue");
    expect(html).toContain("add 2026-10-08");
    expect(html).not.toContain("Done today");
  });

  it("renders scheduled tasks in their goal's colour, side by side with overlapping Google Calendar events (goals ticket 07)", () => {
    process.env.TZ = "Europe/Zurich";
    const events = [{ id: "e1", title: "Team sync", start: at(7, 9, 30), end: at(7, 10), allDay: false, htmlLink: null, color: "#4285f4" }];
    const planner = { taskColor: () => "oklch(0.64 0.16 150)", change: async () => {}, unschedule() {}, toolbar: createElement("button", { "data-schedule-action": "unscheduled" }) };
    const html = render(createElement(TodaySchedule, { tasks, events, slots: { ...slots, planner }, now: new Date(2026, 9, 7, 10) }));
    // 09:00–10:30 and the 09:30 event overlap: two columns.
    expect(html).toMatch(/class="event-block"[^>]*style="top:456px;height:24px;[^"]*left:calc\(50% \+ 0.125rem\);width:calc\(50% - 0.25rem\)/);
    expect(html).toMatch(/data-block="task" data-task-id="Timed standup"[^>]*style="top:432px;height:72px;border-left:3px solid oklch\(0.64 0.16 150\)[^"]*left:calc\(0% \+ 0.125rem\)/);
    expect(html).toContain('data-schedule-action="unscheduled"');
    expect(html).not.toContain("new-block");
  });

  it("renders the month grid (Sunday start) with task chips and the Monday week marker", () => {
    process.env.TZ = "Europe/Zurich";
    const html = render(createElement(CalendarView, { tasks, slots, now: new Date(2026, 9, 7, 10) }));
    expect(html).toContain("October 2026");
    expect(html).toContain("Week of Oct 5");
    expect(html.indexOf(">Sun<")).toBeLessThan(html.indexOf(">Mon<"));
    expect(html.match(/class="month-day[^"]*"/g)).toHaveLength(35);
    expect(html).toContain('class="month-date today">7<');
    expect(html).toContain(">Timed standup</button>");
  });

  it("renders Today's schedule: overdue and all-day tasks above, timed blocks by local hour", () => {
    process.env.TZ = "Europe/Zurich";
    const html = render(createElement(TodaySchedule, { tasks, slots, now: new Date(2026, 9, 7, 10) }));
    expect(html).toContain("All day");
    expect(html.indexOf("Overdue review")).toBeLessThan(html.indexOf("All-day plan"));
    expect(html).toContain("top:432px;height:72px");
    expect(html).toContain("09:00–10:30");
    expect(html).not.toContain("Tomorrow call");
    expect(html).not.toContain("Done today");
  });

  it("lets Today show completed tasks and swap its list for the calendar layout", () => {
    const state = { status: "success" as const, data: { tasks, openCount: 3 }, error: null };
    const now = new Date(2026, 9, 7, 10);
    expect(render(createElement(TodayView, { state, onRetry() {}, now, showCompleted: true }))).toContain("Done today");
    expect(render(createElement(TodayView, { state, onRetry() {}, now }))).not.toContain("Done today");
    const calendar = render(createElement(TodayView, { state, onRetry() {}, now, calendar: shown => createElement("p", null, `calendar ${shown.length}`) }));
    expect(calendar).toContain("3 tasks");
    expect(calendar).toContain("calendar 5");
  });
});

describe("time blocks on the schedule (goals ticket 07)", () => {
  // Built per test: other tests change process.env.TZ, which moves a Date made at load.
  let day: Date;
  beforeEach(() => { process.env.TZ = "Europe/Zurich"; day = new Date(2026, 1, 21); });
  const at = (h: number, m = 0, d = day) => { const date = new Date(d); date.setHours(h, m, 0, 0); return date; };
  const hm = (date: Date) => `${dayKey(date)} ${labels.time(date)}`;

  it.each([
    ["a downward drag", 9 * 48, 11 * 48, "09:00", "11:00"],
    ["an upward drag", 11 * 48, 9 * 48 + 10, "09:15", "11:00"],
    ["a tiny drag (at least 15 minutes)", 9 * 48, 9 * 48 + 7, "09:00", "09:15"],
    ["a drag past midnight", 23 * 48, 30 * 48, "23:00", "00:00"],
    ["a drag above the grid", -40, 48, "00:00", "01:00"],
  ])("creates a block over %s, snapped to 15 minutes", (_name, from, to, start, end) => {
    const range = rangeAt(day, from, to);
    expect([labels.time(range.start), labels.time(range.end)]).toEqual([start, end]);
    expect(range.end.getTime() - range.start.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
  });

  it.each([
    ["move down 1h", "move", 48, 0, "2026-02-21 10:00", "2026-02-21 12:00"],
    ["move up 20 min (snaps to 15)", "move", -16, 0, "2026-02-21 08:45", "2026-02-21 10:45"],
    ["move to the next day", "move", 0, 1, "2026-02-22 09:00", "2026-02-22 11:00"],
    ["move past midnight stays in the day", "move", 20 * 48, 0, "2026-02-21 22:00", "2026-02-22 00:00"],
    ["move above midnight stays in the day", "move", -20 * 48, -1, "2026-02-20 00:00", "2026-02-20 02:00"],
    ["resize longer", "resize", 24, 0, "2026-02-21 09:00", "2026-02-21 11:30"],
    ["resize to less than 15 minutes", "resize", -5 * 48, 0, "2026-02-21 09:00", "2026-02-21 09:15"],
    ["resize past midnight", "resize", 20 * 48, 0, "2026-02-21 09:00", "2026-02-22 00:00"],
  ] as const)("%s", (_name, mode, dy, shift, start, end) => {
    const range = dragRange(mode, at(9), at(11), dy, shift);
    expect([hm(range.start), hm(range.end)]).toEqual([start, end]);
  });

  it("keeps wall-clock times when a block moves across a DST change", () => {
    const saturday = new Date(2026, 2, 28);
    const range = dragRange("move", at(9, 0, saturday), at(10, 0, saturday), 0, 1);
    expect([hm(range.start), hm(range.end)]).toEqual(["2026-03-29 09:00", "2026-03-29 10:00"]);
  });

  it("presents a scheduled task as a block holding just that task, from its own dates", () => {
    const scheduled = task("Write", { dueDate: "2026-02-21T09:00:00.000Z", dueDateEnd: "2026-02-21T10:30:00.000Z" });
    const item = taskItem(scheduled, "green");
    expect(item).toMatchObject({ key: "task:Write", title: "Write", color: "green", done: false, task: scheduled });
    expect([item.start.toISOString(), item.end.toISOString()]).toEqual([scheduled.dueDate, scheduled.dueDateEnd]);
    // Without an end it is 30 minutes long, as before.
    expect(taskItem(task("Call", { dueDate: "2026-02-21T09:00:00.000Z" }), null).end.toISOString()).toBe("2026-02-21T09:30:00.000Z");
  });

  it("offers the next quarter hour today for the task's duration from a menu", () => {
    const range = nextSlot(45, at(14, 7));
    expect([labels.time(range.start), labels.time(range.end)]).toEqual(["14:15", "15:00"]);
    expect(labels.time(nextSlot(30, at(23, 50)).start)).toBe("23:30");
    expect(spanFor(at(23), at(0, 0, addDays(day, 1)))).toEqual({ top: 23 * 48, height: 48 });
  });
});

describe("unscheduled sidebar (goals ticket 08)", () => {
  const open = [
    task("Spec", { projectId: "p1", priority: 1, labelIds: ["deep"] }),
    task("Inbox chore", { priority: 4 }),
    // Midnight and 09:00 in Zurich.
    task("Dated", { projectId: "p2", dueDate: "2026-02-20T23:00:00.000Z", labelIds: ["deep"] }),
    task("Timed", { dueDate: "2026-02-21T08:00:00.000Z" }),
    task("Done", { status: "done" }),
  ];
  const links = { projects: [{ goalId: "g1", projectId: "p1" }], tasks: [{ goalId: "g2", taskId: "Inbox chore" }] };
  beforeEach(() => { process.env.TZ = "Europe/Zurich"; });
  const ids = (filter: Parameters<typeof unscheduledTasks>[1]) => unscheduledTasks(open, filter, links).map(item => item.id);

  it.each([
    ["no filter: open, without a time (a date alone is unscheduled)", {}, ["Spec", "Inbox chore", "Dated"]],
    ["a goal through the task's project", { goalId: "g1" }, ["Spec"]],
    ["a goal linked to the task itself", { goalId: "g2" }, ["Inbox chore"]],
    ["a project", { projectId: "p2" }, ["Dated"]],
    ["the Inbox", { projectId: null }, ["Inbox chore"]],
    ["a priority", { priority: 4 }, ["Inbox chore", "Dated"]],
    ["a label", { labelId: "deep" }, ["Spec", "Dated"]],
    ["filters together", { labelId: "deep", projectId: "p1" }, ["Spec"]],
  ])("lists %s", (_name, filter, expected) => expect(ids(filter)).toEqual(expected));

  it("schedules a dropped task for its duration at the snapped slot, ending by midnight", () => {
    process.env.TZ = "Europe/Zurich";
    const day = new Date(2026, 2, 29);
    const { start, end } = dropRange(day, 9.4 * 48);
    expect([labels.time(start), labels.time(end)]).toEqual(["09:30", "10:00"]);
    const late = dropRange(day, 24 * 48, 60);
    expect([labels.time(late.start), late.end.getTime()]).toEqual(["23:00", addDays(day, 1).getTime()]);
  });

  it.each([
    ["no end", {}, 30],
    ["its own range", { dueDate: "2026-02-21T09:00:00.000Z", dueDateEnd: "2026-02-21T10:15:00.000Z" }, 75],
    ["a range longer than a day", { dueDate: "2026-02-21T09:00:00.000Z", dueDateEnd: "2026-02-23T09:00:00.000Z" }, 30],
  ])("lasts %s: %i minutes", (_name, dates, minutes) => expect(durationOf(task("t", dates))).toBe(minutes));

  it("colours a task by its first goal in sidebar order, directly or through its project", () => {
    const goals = [{ id: "g2" }, { id: "g1" }];
    expect(goalOf(task("Spec", { projectId: "p1" }), goals, links)?.id).toBe("g1");
    expect(goalOf(task("Inbox chore", { projectId: "p1" }), goals, links)?.id).toBe("g2");
    expect(goalOf(task("Loose"), goals, links)).toBeUndefined();
  });

  it("schedules and unschedules with the task's own version and fields; unscheduling keeps the day", () => {
    const timed = task("Call", { title: "Call", dueDate: "2026-02-21T08:00:00.000Z", dueDateEnd: "2026-02-21T09:00:00.000Z", updatedAt: "v1", priority: 2 });
    expect(unscheduledDetails(timed)).toMatchObject({ updatedAt: "v1", title: "Call", priority: 2, description: "", dueDate: "2026-02-20T23:00:00.000Z", dueDateEnd: null });
    const range = { start: new Date("2026-02-21T10:00:00.000Z"), end: new Date("2026-02-21T10:30:00.000Z") };
    expect(scheduledDetails(timed, range.start, range.end)).toMatchObject({ updatedAt: "v1", dueDate: "2026-02-21T10:00:00.000Z", dueDateEnd: "2026-02-21T10:30:00.000Z" });
  });
});

describe("overlap layout", () => {
  const r = (from: number, to: number) => ({ start: new Date(2026, 1, 21, 0, from), end: new Date(2026, 1, 21, 0, to) });
  it.each([
    ["nothing", [], []],
    ["one item", [r(60, 120)], [[0, 1]]],
    ["two apart", [r(60, 120), r(180, 240)], [[0, 1], [0, 1]]],
    ["touching ranges do not overlap", [r(60, 120), r(120, 180)], [[0, 1], [0, 1]]],
    ["two overlapping", [r(60, 120), r(90, 150)], [[0, 2], [1, 2]]],
    ["three at once", [r(60, 120), r(60, 120), r(60, 120)], [[0, 3], [1, 3], [2, 3]]],
    ["a chain shares one cluster; a freed column is reused", [r(60, 120), r(90, 180), r(130, 200)], [[0, 2], [1, 2], [0, 2]]],
    ["input order kept; longer first at the same start", [r(90, 100), r(60, 180), r(60, 240)], [[2, 3], [1, 3], [0, 3]]],
    ["a later cluster starts over", [r(60, 120), r(90, 150), r(300, 330)], [[0, 2], [1, 2], [0, 1]]],
    ["a zero-length item still takes a column", [r(60, 60), r(60, 90)], [[1, 2], [0, 2]]],
  ] as const)("%s", (_name, ranges, expected) => {
    expect(overlapColumns(ranges).map(({ column, columns }) => [column, columns])).toEqual(expected);
  });
});
