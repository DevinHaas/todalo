import { afterEach, describe, expect, it } from "vitest";
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
  addMonths, blockFor, dayKey, eachDay, extendWindow, labels, monthGrid, navigateViewDate, nextLayout, slotAt, tasksByDay,
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

  it("cycles list and calendar layouts while board waits for ticket 17", () => {
    expect(nextLayout("list")).toBe("calendar");
    expect(nextLayout("calendar")).toBe("list");
    expect(nextLayout("list", -1)).toBe("calendar");
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
