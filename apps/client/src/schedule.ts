// Upcoming, month/week calendar and daily schedule rules (ticket 16), ported
// from the legacy date-fns views (apps/web/components/tasks/upcoming-list-view,
// calendar-view, week-schedule-view, schedule-grid, lib/view-navigation).
// Every task date is an ISO instant read in the viewer's local zone, as the
// legacy client did, so grouping follows local midnights through DST changes.
// Provider events (ticket 20) group with `eventDayKey` (calendar.ts) and timed
// ones position with `blockFor` (start/end instants), next to tasks in each view.
import type { TaskDto } from "./tasks";
import { isOverdue, treeOrder } from "./tasks";
import type { TimeBlockDto } from "./time-blocks";
import { goalTime } from "../../../packages/server/src/time-block-dto";

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

/** A done task with a time range still shows in calendars: the time was spent on it. */
export const onCalendar = (task: TaskDto, showCompleted: boolean) => showCompleted || task.status !== "done" || (task.dueDate !== null && task.dueDateEnd !== null);

/** Dated tasks by local day key, in collection order (legacy calendar/week maps); calendars keep done tasks with a duration. */
export function tasksByDay(tasks: TaskDto[], showCompleted: boolean) {
  const days = new Map<string, TaskDto[]>();
  for (const task of tasks.filter(item => onCalendar(item, showCompleted))) {
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

// Goals ticket 07: time blocks and scheduled tasks share one presentation. A
// scheduled task is a block holding just that task, positioned from its own
// dueDate/dueDateEnd (never stored as a block); a time block is reserved time.
/** One block on the grid: a stored time block, or a scheduled task shown as a single-task block. */
export interface ScheduleItem { key: string; title: string; start: Date; end: Date; color: string | null; done: boolean; task?: TaskDto; block?: TimeBlockDto }
export const taskItem = (task: TaskDto, color: string | null): ScheduleItem => {
  const { start, end } = blockFor(task.dueDate!, task.dueDateEnd);
  return { key: `task:${task.id}`, title: task.title, start, end, color, done: task.status === "done", task };
};
/** Untitled blocks take their goal's title, else "Time block". */
export const blockItem = (block: TimeBlockDto, goal?: { title: string; color: string }): ScheduleItem =>
  ({ key: `block:${block.id}`, title: block.title ?? goal?.title ?? "Time block", start: new Date(block.start), end: new Date(block.end), color: goal?.color ?? null, done: block.outcome === "done", block });

/** Top and height from the duration, so a block ending at midnight still reaches the bottom; at least 20px (legacy). */
export const spanFor = (start: Date, end: Date) => ({ top: offsetFor(start), height: Math.max((end.getTime() - start.getTime()) / 3_600_000 * HOUR_HEIGHT, 20) });

const MINUTE = 60_000;
const snapped = (y: number) => Math.round((y / HOUR_HEIGHT) * 60 / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES;
/** Further than this (px) is a drag; less is a click. */
export const DRAG_THRESHOLD = 6;

/** Dragging over an empty slot from `fromY` to `toY` (px in the day column): 15-minute snap, at least 15 minutes, within the day. */
export function rangeAt(day: Date, fromY: number, toY: number) {
  let from = Math.min(Math.max(snapped(Math.min(fromY, toY)), 0), 24 * 60 - CLICK_SLOT_MINUTES);
  const to = Math.min(Math.max(snapped(Math.max(fromY, toY)), from + CLICK_SLOT_MINUTES), 24 * 60);
  from = Math.min(from, to - CLICK_SLOT_MINUTES);
  const start = startOfDay(day), end = startOfDay(day);
  start.setHours(0, from, 0, 0);
  end.setHours(0, to, 0, 0);
  return { start, end };
}

/**
 * A dragged block's new range. Move: keeps its length, shifts by `dy` (snapped)
 * and `dayShift` columns, and stays within the day it lands on. Resize: keeps
 * the start and drags the end, at least 15 minutes and at most to midnight.
 */
export function dragRange(mode: "move" | "resize", start: Date, end: Date, dy: number, dayShift = 0) {
  const minutes = snapped(dy) * MINUTE;
  if (mode === "resize") {
    const midnight = addDays(startOfDay(start), 1).getTime();
    return { start, end: new Date(Math.min(Math.max(end.getTime() + minutes, start.getTime() + CLICK_SLOT_MINUTES * MINUTE), midnight)) };
  }
  const length = end.getTime() - start.getTime();
  const shifted = addDays(start, dayShift);
  const day = startOfDay(shifted).getTime(), midnight = addDays(startOfDay(shifted), 1).getTime();
  const next = Math.min(Math.max(shifted.getTime() + minutes, day), Math.max(midnight - length, day));
  return { start: new Date(next), end: new Date(next + length) };
}

/** A new block from the keyboard: the next quarter hour today if `day` is today, else 09:00; one hour. */
export function defaultBlockRange(day: Date, now = new Date()) {
  const start = startOfDay(day);
  if (sameDay(day, now)) start.setHours(0, Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES, 23 * 60), 0, 0);
  else start.setHours(9, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * MINUTE) };
}

// Goals ticket 08: the unscheduled sidebar and tasks in blocks.
/** Sidebar filters; an absent field matches everything. `projectId: null` is the Inbox. */
export interface UnscheduledFilter { goalId?: string; projectId?: string | null; priority?: number; labelId?: string }
/** Which goals a task serves: linked directly or through its project. */
export interface GoalLinks { projects: { goalId: string; projectId: string }[]; tasks: { goalId: string; taskId: string }[] }
export const servesGoal = (task: TaskDto, goalId: string, links: GoalLinks) =>
  links.tasks.some(link => link.goalId === goalId && link.taskId === task.id)
  || (task.projectId !== null && links.projects.some(link => link.goalId === goalId && link.projectId === task.projectId));

/** Open tasks without a scheduled time (no time of day, in no block), filtered; in collection order. */
export function unscheduledTasks(tasks: TaskDto[], blocks: TimeBlockDto[], filter: UnscheduledFilter, links: GoalLinks) {
  const inBlock = new Set(blocks.flatMap(block => block.taskIds));
  return tasks.filter(task => task.status !== "done" && !isTimed(task) && !inBlock.has(task.id)
    && (filter.goalId === undefined || servesGoal(task, filter.goalId, links))
    && (filter.projectId === undefined || task.projectId === filter.projectId)
    && (filter.priority === undefined || task.priority === filter.priority)
    && (filter.labelId === undefined || task.labelIds.includes(filter.labelId)));
}

/** A task dropped at `y` px in a day column: starts at the snapped slot, 30 minutes, ending by midnight. */
export function dropRange(day: Date, y: number) {
  const { start } = slotAt(day, y);
  const midnight = addDays(startOfDay(day), 1).getTime();
  return { start, end: new Date(Math.min(start.getTime() + DEFAULT_DURATION_MINUTES * MINUTE, midnight)) };
}

// Goals ticket 09: block outcomes and the week's reserved vs kept time per goal.
/** Per goal, minutes reserved and kept in the local Monday-to-Sunday week around `now`. */
export const weekGoalTime = (blocks: TimeBlockDto[], now = new Date()) =>
  goalTime(blocks.filter(block => !block.id.startsWith("pending-")), startOfWeek(now, 1), addDays(startOfWeek(now, 1), 7));
/** "1h 30m", "2h", "45m". */
export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = Math.round(minutes % 60);
  return hours && rest ? `${hours}h ${rest}m` : hours ? `${hours}h` : `${rest}m`;
}
/** Pressing the outcome a block already has puts it back to planned; rescheduling always counts again. */
export const toggledOutcome = (current: TimeBlockDto["outcome"], pressed: TimeBlockDto["outcome"]) =>
  pressed !== "rescheduled" && current === pressed ? "planned" : pressed;
