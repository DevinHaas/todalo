// Upcoming, month/week calendar and daily schedule rules (ticket 16), ported
// from the legacy date-fns views (apps/web/components/tasks/upcoming-list-view,
// calendar-view, week-schedule-view, schedule-grid, lib/view-navigation).
// Every task date is an ISO instant read in the viewer's local zone, as the
// legacy client did, so grouping follows local midnights through DST changes.
// Provider events (ticket 20) group with `eventDayKey` (calendar.ts) and timed
// ones position with `blockFor` (start/end instants), next to tasks in each view.
import type { TaskDetails, TaskDto } from "./tasks";
import { isOverdue, treeOrder } from "./tasks";
import { effectiveHorizon } from "../../../packages/server/src/task-dto";
import { OVERFLOW_HOURS } from "../../../packages/server/src/drafts";

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

// Time blocks (goals ticket 07, reworked): a scheduled task IS a block. Every
// task with a time of day shows on the grid from its own dueDate/dueDateEnd, in
// its goal's colour; nothing else is stored.
/** One task on the grid. */
export interface ScheduleItem { key: string; title: string; start: Date; end: Date; color: string | null; done: boolean; task: TaskDto }
export const taskItem = (task: TaskDto, color: string | null): ScheduleItem => {
  const { start, end } = blockFor(task.dueDate!, task.dueDateEnd);
  return { key: `task:${task.id}`, title: task.title, start, end, color, done: task.status === "done", task };
};

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

/** "Schedule" from a menu: the next quarter hour today, for the task's duration. */
export function nextSlot(minutes = DEFAULT_DURATION_MINUTES, now = new Date()) {
  const start = startOfDay(now);
  start.setHours(0, Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES, 24 * 60 - minutes), 0, 0);
  return { start, end: new Date(start.getTime() + minutes * MINUTE) };
}

/** Which goals a task serves: linked directly or through its project. */
export interface GoalLinks { projects: { goalId: string; projectId: string }[]; tasks: { goalId: string; taskId: string }[] }
export const servesGoal = (task: TaskDto, goalId: string, links: GoalLinks) =>
  links.tasks.some(link => link.goalId === goalId && link.taskId === task.id)
  || (task.projectId !== null && links.projects.some(link => link.goalId === goalId && link.projectId === task.projectId));

// Goals ticket 14c: the Plan sidebar (planning beside the schedule and the Check-in). No AI; the Coach ranks later.
// Ticket 31: tasks without a date wait by horizon: Now, Next, the Inbox's unsorted, Later.
export type PlanGroup = "overdue" | "today" | "week" | "now" | "next" | "inbox" | "later";
export const planGroupOrder: readonly PlanGroup[] = ["overdue", "today", "week", "now", "next", "inbox", "later"];
/** Ticket 31: the sections that start collapsed until the user opens them. */
export const planGroupsClosed: readonly PlanGroup[] = ["inbox", "later"];
/**
 * Where an open task waits to be planned: overdue (any earlier day, with or
 * without a time), due today or in the next 7 days without a time, or, without
 * a date, by its horizon (ticket 31: Now, Next, a project task without one is
 * Next, Later; an Inbox task without one is unsorted, "inbox"). Sub-tasks go
 * with their parent. Anything else (a time today or later, a later day) is not
 * listed; a Later task with a date comes back when it is due.
 */
export function planGroupOf(task: TaskDto, now = new Date()): PlanGroup | null {
  if (task.status === "done") return null;
  // An undated sub-task is planned with its parent.
  if (!task.dueDate) return task.parentId === null ? effectiveHorizon(task) ?? "inbox" : null;
  const day = dayKey(new Date(task.dueDate)), today = dayKey(now);
  if (day < today) return "overdue";
  if (isTimed(task)) return null;
  if (day === today) return "today";
  return day <= dayKey(addDays(startOfDay(now), 7)) ? "week" : null;
}
/** One Plan row: the task and the first goal (sidebar order) it serves. */
export interface PlanItem<G> { task: TaskDto; goal: G | null }
/**
 * The Plan sidebar's groups, in planGroupOrder. `projectId` filters (null is
 * the Inbox; undefined every project); `skip` leaves out ritual items. Goal
 * tasks first in each group, then by date, else in collection order.
 * Ticket 31: the undated sections (Now, Next, Inbox, Later) go primary-goal
 * tasks, secondary-goal tasks (`tiers`: the season's, by goal ID; other goal
 * tasks after them), then by priority, then oldest first.
 */
export function planGroups<G extends { id: string }>(tasks: TaskDto[], goals: G[], links: GoalLinks, { projectId, skip = new Set(), tiers = new Map() }: { projectId?: string | null; skip?: ReadonlySet<string>; tiers?: ReadonlyMap<string, "primary" | "secondary"> } = {}, now = new Date()) {
  const groups: Record<PlanGroup, PlanItem<G>[]> = { overdue: [], today: [], week: [], now: [], next: [], inbox: [], later: [] };
  for (const task of tasks) {
    const group = skip.has(task.id) || (projectId !== undefined && task.projectId !== projectId) ? null : planGroupOf(task, now);
    if (group) groups[group].push({ task, goal: goalOf(task, goals, links) ?? null });
  }
  const time = (item: PlanItem<G>) => item.task.dueDate ? Date.parse(item.task.dueDate) : 0;
  // A goal outside the season (or no season) still goes before tasks without a goal.
  const tier = (item: PlanItem<G>) => { const linked = goals.filter(goal => servesGoal(item.task, goal.id, links)).map(goal => tiers.get(goal.id)); return linked.includes("primary") ? 0 : linked.includes("secondary") ? 1 : linked.length ? 2 : 3; };
  const created = (item: PlanItem<G>) => item.task.createdAt ? Date.parse(item.task.createdAt) : 0;
  for (const group of planGroupOrder) groups[group].sort(group === "overdue" || group === "today" || group === "week"
    ? (a, b) => Number(!a.goal) - Number(!b.goal) || time(a) - time(b)
    : (a, b) => tier(a) - tier(b) || a.task.priority - b.task.priority || created(a) - created(b));
  return groups;
}

/**
 * Ticket 31: the open minutes left this week (up to the end of `weekEnd`'s
 * previous day), by ticket 28's overflow rules: OVERFLOW_HOURS each day from
 * now on, less timed open tasks and timed calendar events (all-day ones never block).
 */
export function freeMinutesLeft(tasks: readonly TaskDto[], events: readonly { start: string; end: string; allDay: boolean }[], weekEnd: Date, now = new Date()) {
  const busy = [
    ...tasks.filter(task => task.status !== "done" && isTimed(task)).map(task => ({ start: Date.parse(task.dueDate!), end: Date.parse(task.dueDate!) + durationOf(task) * MINUTE })),
    ...events.filter(event => !event.allDay).map(event => ({ start: Date.parse(event.start), end: Date.parse(event.end) })),
  ];
  const at = (day: Date, time: string) => { const [hours, minutes] = time.split(":").map(Number); const date = new Date(day); date.setHours(hours!, minutes!, 0, 0); return date.getTime(); };
  let free = 0;
  for (let day = startOfDay(now); day < weekEnd; day = addDays(day, 1)) {
    const from = Math.max(at(day, OVERFLOW_HOURS.from), now.getTime()), to = at(day, OVERFLOW_HOURS.to);
    if (from >= to) continue;
    // The busy blocks within the window, merged, come off the window.
    const blocks = busy.map(block => ({ start: Math.max(block.start, from), end: Math.min(block.end, to) })).filter(block => block.start < block.end).sort((a, b) => a.start - b.start);
    let taken = 0, reach = from;
    for (const block of blocks) { if (block.end > reach) { taken += block.end - Math.max(block.start, reach); reach = block.end; } }
    free += (to - from - taken) / MINUTE;
  }
  return Math.round(free);
}
/** "Reschedule" on Overdue: the same time of day (if any) and length, today. */
export function rescheduledDetails(task: TaskDto, now = new Date()): TaskDetails {
  const due = new Date(task.dueDate!), start = startOfDay(now);
  start.setHours(due.getHours(), due.getMinutes(), 0, 0);
  const end = task.dueDateEnd ? new Date(start.getTime() + new Date(task.dueDateEnd).getTime() - due.getTime()) : null;
  return { ...detailsOf(task), dueDate: start.toISOString(), dueDateEnd: end && end > start ? end.toISOString() : null };
}
/** Undo: puts the task's own dates back, on its current version. */
export const datedDetails = (task: TaskDto, dates: Pick<TaskDto, "dueDate" | "dueDateEnd">): TaskDetails => ({ ...detailsOf(task), dueDate: dates.dueDate, dueDateEnd: dates.dueDateEnd });

/**
 * The first quarter hour from now today where `minutes` fit without overlapping
 * today's timed tasks; the plain next slot when the day is full.
 * ponytail: tasks only; connected-calendar events are not counted as busy.
 */
export function nextFreeSlot(tasks: TaskDto[], minutes = DEFAULT_DURATION_MINUTES, now = new Date()) {
  const fallback = nextSlot(minutes, now);
  const busy = tasks.filter(task => isTimed(task) && sameDay(new Date(task.dueDate!), now)).map(task => blockFor(task.dueDate!, task.dueDateEnd));
  const midnight = addDays(startOfDay(now), 1).getTime();
  let start = fallback.start.getTime();
  for (;;) {
    const end = start + minutes * MINUTE;
    if (end > midnight) return fallback;
    const clash = busy.find(block => block.start.getTime() < end && block.end.getTime() > start);
    if (!clash) return { start: new Date(start), end: new Date(end) };
    start = Math.ceil(clash.end.getTime() / (CLICK_SLOT_MINUTES * MINUTE)) * CLICK_SLOT_MINUTES * MINUTE;
  }
}

/** A task's length on the grid: its own range when it has one within a day, else 30 minutes. */
export function durationOf(task: TaskDto) {
  const minutes = task.dueDate && task.dueDateEnd ? (new Date(task.dueDateEnd).getTime() - new Date(task.dueDate).getTime()) / MINUTE : 0;
  return minutes >= CLICK_SLOT_MINUTES && minutes <= 24 * 60 ? minutes : DEFAULT_DURATION_MINUTES;
}

/** A task dropped at `y` px in a day column: starts at the snapped slot, keeps `minutes`, ending by midnight. */
export function dropRange(day: Date, y: number, minutes = DEFAULT_DURATION_MINUTES) {
  const { start } = slotAt(day, y);
  const midnight = addDays(startOfDay(day), 1).getTime();
  const begin = Math.min(start.getTime(), midnight - minutes * MINUTE);
  return { start: new Date(begin), end: new Date(begin + minutes * MINUTE) };
}

/** The first goal in sidebar order the task serves (directly or through its project). */
export const goalOf = <G extends { id: string }>(task: TaskDto, goals: G[], links: GoalLinks) => goals.find(goal => servesGoal(task, goal.id, links));

/** Every editable field as the task has it, from its current version (the stale-edit check). */
const detailsOf = (task: TaskDto): TaskDetails => ({
  updatedAt: task.updatedAt ?? "", title: task.title, description: task.description ?? "", priority: task.priority,
  deadline: task.deadline, dueDate: task.dueDate, dueDateEnd: task.dueDateEnd, recurrence: task.recurrence,
});
/** The edit that puts a task on the schedule from `start` to `end`. */
export const scheduledDetails = (task: TaskDto, start: Date, end: Date): TaskDetails => ({ ...detailsOf(task), dueDate: start.toISOString(), dueDateEnd: end.toISOString() });
/** Ticket 14b: gives a task a due date (all day, local midnight of the YYYY-MM-DD `day`). */
export const dueDetails = (task: TaskDto, day: string): TaskDetails => ({ ...detailsOf(task), dueDate: parseDayKey(day).toISOString(), dueDateEnd: null });
/** Unschedule: clears the time and duration; the task keeps its day (all day). */
export const unscheduledDetails = (task: TaskDto): TaskDetails =>
  ({ ...detailsOf(task), dueDate: task.dueDate && startOfDay(new Date(task.dueDate)).toISOString(), dueDateEnd: null });

/**
 * Standard calendar overlap layout: items that overlap (directly or through a
 * chain) form a cluster and share its width side by side; each takes the first
 * column free at its start. Returns `column` and the cluster's `columns` per
 * item, in input order. Touching ranges (one ends as the next starts) do not overlap.
 */
export function overlapColumns(ranges: readonly { start: Date; end: Date }[]) {
  const order = ranges.map((range, index) => ({ index, start: range.start.getTime(), end: Math.max(range.end.getTime(), range.start.getTime() + 1) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const result: { column: number; columns: number }[] = ranges.map(() => ({ column: 0, columns: 1 }));
  let cluster: number[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => { for (const index of cluster) result[index]!.columns = ends.length; cluster = []; ends = []; };
  for (const item of order) {
    if (item.start >= clusterEnd) { close(); clusterEnd = -Infinity; }
    let column = ends.findIndex(end => end <= item.start);
    if (column < 0) { column = ends.length; ends.push(item.end); } else ends[column] = item.end;
    result[item.index]!.column = column;
    cluster.push(item.index);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  close();
  return result;
}
