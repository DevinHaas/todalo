// Upcoming, month/week calendar and daily schedule rules (ticket 16), ported
// from the legacy date-fns views (apps/web/components/tasks/upcoming-list-view,
// calendar-view, week-schedule-view, schedule-grid, lib/view-navigation).
// Every task date is an ISO instant read in the viewer's local zone, as the
// legacy client did, so grouping follows local midnights through DST changes.
// Provider events (ticket 20) group with `eventDayKey` (calendar.ts) and timed
// ones position with `blockFor` (start/end instants), next to tasks in each view.
import type { TaskDto } from "./tasks";
import { isOverdue, treeOrder } from "./tasks";

export type Layout = "list" | "board" | "calendar";
export type CalendarRange = "week" | "month";
export type ViewDateAction = "today" | "next-week" | "previous-week";
/** Legacy DisplaySettingsProvider defaults; kept in memory for the session, as legacy did. */
export interface DisplaySettings { layout: Layout; showCompleted: boolean; calendarRange: CalendarRange }
export const defaultDisplay: DisplaySettings = { layout: "list", showCompleted: false, calendarRange: "month" };

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
/** date-fns addDays: same local wall time `n` calendar days later (not n × 24h). */
export const addDays = (date: Date, n: number) => { const next = new Date(date); next.setDate(next.getDate() + n); return next; };
/** date-fns startOfWeek; legacy uses Monday (1) for weeks and Sunday (0) for the month grid. */
export const startOfWeek = (date: Date, weekStartsOn: 0 | 1) => {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() - weekStartsOn + 7) % 7));
};
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const pad = (value: number) => String(value).padStart(2, "0");
/** Local "yyyy-MM-dd": the grouping key, also the Upcoming section id. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** Local midnight of a dayKey (date-fns parseISO of a date-only string). */
export const parseDayKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
/** Calendar days from `start` to `end` inclusive; DST-length days still count once. */
export function eachDay(start: Date, end: Date) {
  const count = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addDays(startOfDay(start), i));
}

export function navigateViewDate(anchor: Date, action: ViewDateAction, today = new Date()) {
  return action === "today" ? startOfDay(today) : addDays(anchor, action === "next-week" ? 7 : -7);
}
/** Legacy lib/view-navigation nextLayout: list → board → calendar, wrapping both ways. */
const cycle: Layout[] = ["list", "board", "calendar"];
export function nextLayout(layout: Layout, direction = 1): Layout {
  return cycle[(cycle.indexOf(layout) + direction + cycle.length) % cycle.length];
}

// Per call, not a cached Intl.DateTimeFormat: that pins the zone it was built in,
// while these must follow the zone the getDate()/getHours() reads use.
const fmt = (options: Intl.DateTimeFormatOptions) => ({ format: (date: Date) => date.toLocaleString("en-US", options) });
const monthShort = fmt({ month: "short" }), monthLong = fmt({ month: "long" });
const weekdayLong = fmt({ weekday: "long" }), weekdayShort = fmt({ weekday: "short" });
/** date-fns tokens the legacy views render (en-US). */
export const labels = {
  /** "d MMM · Today · EEEE", "· Tomorrow ·" for the next day. */
  day(date: Date, now = new Date()) {
    const base = `${date.getDate()} ${monthShort.format(date)}`;
    const weekday = weekdayLong.format(date);
    if (sameDay(date, now)) return `${base} · Today · ${weekday}`;
    if (sameDay(date, addDays(startOfDay(now), 1))) return `${base} · Tomorrow · ${weekday}`;
    return `${base} · ${weekday}`;
  },
  weekday: (date: Date) => weekdayShort.format(date),
  /** "MMMM yyyy" */
  month: (date: Date) => `${monthLong.format(date)} ${date.getFullYear()}`,
  /** "MMM d" */
  monthDay: (date: Date) => `${monthShort.format(date)} ${date.getDate()}`,
  /** "MMM d – MMM d, yyyy" */
  week: (start: Date) => { const end = addDays(start, 6); return `${labels.monthDay(start)} – ${labels.monthDay(end)}, ${end.getFullYear()}`; },
  time: (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`,
};

const visible = (tasks: TaskDto[], showCompleted: boolean) => showCompleted ? tasks : tasks.filter(task => task.status !== "done");

/** Dated tasks by local day key, in collection order (legacy calendar/week maps). */
export function tasksByDay(tasks: TaskDto[], showCompleted: boolean) {
  const days = new Map<string, TaskDto[]>();
  for (const task of visible(tasks, showCompleted)) {
    if (!task.dueDate) continue;
    const key = dayKey(new Date(task.dueDate));
    days.set(key, [...(days.get(key) ?? []), task]);
  }
  return days;
}

/** Legacy Upcoming window: from Monday of this week to a year from today. */
export const upcomingWindow = (now = new Date()) => ({ start: startOfWeek(now, 1), end: addMonths(startOfDay(now), 12) });
/** The window grows (never shrinks) to include a day the user navigates to. */
export function extendWindow(window: { start: Date; end: Date }, day: Date) {
  return {
    start: day < window.start ? startOfWeek(day, 1) : window.start,
    end: day > window.end ? addDays(startOfWeek(day, 1), 6) : window.end,
  };
}

/** Upcoming list groups: overdue before the window, each day in it, and later. */
export function upcomingSections(tasks: TaskDto[], window: { start: Date; end: Date }, showCompleted: boolean, now = new Date()) {
  const shown = visible(tasks, showCompleted);
  const byDay = tasksByDay(shown, true);
  return {
    overdue: treeOrder(shown.filter(task => isOverdue(task, now) && new Date(task.dueDate!) < window.start)),
    days: eachDay(window.start, window.end).map(day => ({ day, key: dayKey(day), tasks: treeOrder(byDay.get(dayKey(day)) ?? []) })),
    later: treeOrder(shown.filter(task => task.dueDate && new Date(task.dueDate) > window.end && !sameDay(new Date(task.dueDate), window.end))),
  };
}

/** Month grid: Sunday before the 1st to Saturday after the last day (legacy MonthView). */
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return eachDay(startOfWeek(first, 0), addDays(startOfWeek(last, 0), 6));
}
export const weekOf = (anchor: Date) => eachDay(startOfWeek(anchor, 1), addDays(startOfWeek(anchor, 1), 6));
export const addMonths = (date: Date, n: number) => {
  // date-fns clamps the day (31 Jan + 1 month = 28/29 Feb).
  const target = new Date(date.getFullYear(), date.getMonth() + n, 1, date.getHours(), date.getMinutes());
  target.setDate(Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return target;
};

export const HOUR_HEIGHT = 48;
export const DEFAULT_DURATION_MINUTES = 30;
export const CLICK_SLOT_MINUTES = 15;
export const hasDueTime = (date: Date) => date.getHours() !== 0 || date.getMinutes() !== 0;
export const offsetFor = (date: Date) => (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
/** Pixel offset in a day column → minutes since midnight, snapped to 15 minutes. */
export function minutesForOffset(y: number) {
  const snapped = Math.round((y / HOUR_HEIGHT) * 60 / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES;
  return Math.min(Math.max(snapped, 0), 24 * 60 - CLICK_SLOT_MINUTES);
}
/** A clicked slot on `day`: local wall-clock start and a 15-minute end. */
export function slotAt(day: Date, y: number) {
  const start = startOfDay(day);
  start.setHours(0, minutesForOffset(y), 0, 0);
  return { start, end: new Date(start.getTime() + CLICK_SLOT_MINUTES * 60_000) };
}
/** A timed block's position: `end` defaults to 30 minutes; at least 20px tall (legacy). */
export function blockFor(startValue: string, endValue: string | null) {
  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  const top = offsetFor(start);
  return { start, end, top, height: Math.max(offsetFor(end) - top, 20) };
}
/** Schedule columns split a day's tasks into the all-day row and timed blocks. */
export const isTimed = (task: TaskDto) => task.dueDate !== null && hasDueTime(new Date(task.dueDate));
