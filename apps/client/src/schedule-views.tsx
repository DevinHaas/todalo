// Upcoming list, month/week calendar and daily schedule (ticket 16): the legacy
// UpcomingListView, CalendarView, WeekScheduleView, TodayScheduleView and
// ScheduleGrid. Pure views (no runtime imports): screens pass rows, composers
// and handlers. Provider events (ticket 20) render first in each day, as legacy.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, LayoutGrid, List, X } from "lucide-react";
import { isDueToday, isOverdue, type TaskDto } from "./tasks";
import {
  DRAG_THRESHOLD, HOUR_HEIGHT, addDays, addMonths, blockItem, dayKey, defaultBlockRange, dragRange, rangeAt, spanFor, taskItem, defaultDisplay, extendWindow, isTimed, labels, monthGrid, navigateViewDate,
  nextLayout, offsetFor, onCalendar, parseDayKey, sameDay, slotAt, startOfDay, startOfWeek, tasksByDay, upcomingSections, upcomingWindow, weekOf,
  type DisplaySettings, type ScheduleItem, type ViewDateAction,
} from "./schedule";
import type { TimeBlockDto } from "./time-blocks";
import { eventsByDay, type CalendarEventDto } from "./calendar";
import { useLocation } from "react-router";
import { EventBlock, EventChip, EventRow } from "./calendar-views";
import { Button, cn } from "./ui";

type Display = DisplaySettings & { set(change: Partial<DisplaySettings>): void };
const DisplayContext = createContext<Display>({ ...defaultDisplay, set() {} });
const DISPLAY_KEY = "todalo.display";
const savedDisplays = (): Record<string, Partial<DisplaySettings>> => {
  try { return JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? "{}") ?? {}; } catch { return {}; }
};
/**
 * Per page (path): Today can stay a list while Upcoming is a calendar. Kept in
 * localStorage, so each page's layout also survives reloads and app restarts.
 */
export function DisplayProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [pages, setPages] = useState(savedDisplays);
  const set = (change: Partial<DisplaySettings>) => setPages(current => {
    const next = { ...current, [pathname]: { ...current[pathname], ...change } };
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(next)); } catch { /* private mode: in memory only */ }
    return next;
  });
  return <DisplayContext.Provider value={{ ...defaultDisplay, ...pages[pathname], set }}>{children}</DisplayContext.Provider>;
}
export const useDisplay = () => useContext(DisplayContext);

const layoutNames = { list: "List", board: "Board", calendar: "Calendar" } as const;
/** Toolbar arrows and label (legacy LayoutSwitcher). */
export function LayoutSwitcher() {
  const display = useDisplay();
  return <>
    <button type="button" className="icon-button" aria-label="Previous layout" onClick={() => display.set({ layout: nextLayout(display.layout, -1) })}><ChevronLeft /></button>
    <button type="button" className="icon-button" aria-label="Next layout" onClick={() => display.set({ layout: nextLayout(display.layout) })}><ChevronRight /></button>
    <span className="layout-label">{layoutNames[display.layout]}</span>
  </>;
}

const stubRows = [["Sort", [["Grouping", "None"], ["Sorting", "Smart"]]], ["Filter", [["Assignee", "Me and unassigned"], ["Deadline", "All"], ["Priority", "All"], ["Label", "All"]]]] as const;
/** Legacy Display dialog. Sort/Filter rows were single-option stubs in legacy too. */
export function DisplayMenu() {
  const display = useDisplay();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <button type="button" className="display-button" aria-haspopup="dialog" onClick={() => setOpen(true)}><List /><span>Display</span></button>
    {open && <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="display-title" className="dialog display-dialog">
        <div className="display-heading"><h2 id="display-title" className="dialog-title">Layout</h2><HelpCircle aria-hidden="true" /><button type="button" className="icon-button" aria-label="Close" autoFocus onClick={close}><X /></button></div>
        <div className="segmented" role="group" aria-label="Layout">
          <button type="button" aria-pressed={display.layout === "list"} onClick={() => display.set({ layout: "list" })}><List />List</button>
          <button type="button" aria-pressed={display.layout === "board"} onClick={() => display.set({ layout: "board" })}><LayoutGrid />Board</button>
          <button type="button" aria-pressed={display.layout === "calendar"} onClick={() => display.set({ layout: "calendar" })}><CalendarDays />Calendar</button>
        </div>
        {display.layout === "calendar" && <div className="segmented" role="group" aria-label="Calendar range">
          {(["week", "month"] as const).map(range => <button key={range} type="button" aria-pressed={display.calendarRange === range} onClick={() => display.set({ calendarRange: range })}>{range === "week" ? "Week" : "Month"}</button>)}
        </div>}
        <label className="display-switch"><span>Completed tasks</span><input type="checkbox" role="switch" checked={display.showCompleted} onChange={(event) => display.set({ showCompleted: event.target.checked })} /></label>
        {stubRows.map(([heading, rows]) => <div key={heading} className="display-stubs">
          <div className="display-section">{heading}<ChevronDown aria-hidden="true" /></div>
          {rows.map(([label, value]) => <div key={label} className="display-row"><span>{label}</span><span className="display-select" aria-disabled="true">{value}<ChevronDown aria-hidden="true" /></span></div>)}
        </div>)}
      </div>
    </div>}
  </>;
}

/** Row rendering and writes supplied by the screen. */
export interface ScheduleSlots {
  /** A list row (TaskRow with actions). */
  row(task: TaskDto): ReactNode;
  /** Opens the task's edit dialog; edits save through taskMutations.update. */
  open(task: TaskDto): void;
  complete(task: TaskDto): void;
  remove(task: TaskDto): void;
  /** A clicked schedule slot: opens the composer with that date and time range. */
  slot(start: Date, end: Date): void;
  /** Goals ticket 07: time blocks and dragging; absent, task blocks only open on click. */
  blocks?: BlockSlots;
}

/** Time blocks on the today and week schedule (goals ticket 07). */
export interface BlockSlots {
  blocks: TimeBlockDto[];
  /** A goal's title and CSS colour; blocks and their goal's tasks show it. */
  goal(goalId: string | null): { title: string; color: string } | undefined;
  /** The CSS colour of a scheduled task's linked goal, if any. */
  taskColor(task: TaskDto): string | null;
  /** Dragged over an empty slot: creates the block and opens it. */
  create(start: Date, end: Date): void;
  open(block: TimeBlockDto): void;
  /** A moved or resized block (or task block: its own dueDate/dueDateEnd); settles once saved or refused. */
  change(item: ScheduleItem, start: Date, end: Date): Promise<unknown>;
  /** Ticket 08: the tasks a block holds, listed inside it. */
  tasksIn(block: TimeBlockDto): TaskDto[];
  /** Ticket 08: extra controls beside Block time (the unscheduled sidebar toggle). */
  toolbar?: ReactNode;
  /** Ticket 09: this week's reserved vs kept time per goal, left of the toolbar. */
  summary?: ReactNode;
}

/** Legacy UpcomingListView: week strip, scroll-spy and one section per day for a year. */
export function UpcomingList({ tasks, events = [], slots, composer, now = new Date() }: { tasks: TaskDto[]; events?: CalendarEventDto[]; slots: ScheduleSlots; composer: (day: Date) => ReactNode; now?: Date }) {
  const { showCompleted } = useDisplay();
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [activeDay, setActiveDay] = useState(() => dayKey(now));
  const [range, setRange] = useState(() => upcomingWindow(now));
  const list = useRef<HTMLDivElement>(null);
  const { overdue, days, later } = upcomingSections(tasks, range, showCompleted, now);
  const eventDays = eventsByDay(events);
  const active = parseDayKey(activeDay);

  const scrollTo = (key: string, container = list.current) => {
    const section = container?.querySelector<HTMLElement>(`section[id="${key}"]`);
    if (container && section) container.scrollTop += section.getBoundingClientRect().top - container.getBoundingClientRect().top;
  };
  function goToDay(day: Date) {
    setRange(current => extendWindow(current, day));
    setActiveDay(dayKey(day));
    requestAnimationFrame(() => scrollTo(dayKey(day)));
  }
  const navigate = (action: ViewDateAction) => goToDay(navigateViewDate(active, action));

  // Scroll-spy by geometry (legacy): the topmost section at or above the list's top is active.
  useEffect(() => {
    const container = list.current;
    if (!container) return;
    const update = () => {
      const top = container.getBoundingClientRect().top;
      let current: string | null = null;
      for (const section of container.querySelectorAll("section[id]")) {
        if (section.getBoundingClientRect().top - top <= 1) current = section.id; else break;
      }
      if (current) setActiveDay(current);
    };
    scrollTo(dayKey(now), container);
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount, as legacy.
  }, []);

  return <div className="upcoming">
    <div className="week-nav">
      <button type="button" className="button ghost small" data-view-nav="previous-week" onClick={() => navigate("previous-week")}>Previous week</button>
      <button type="button" className="button outline small" data-view-nav="today" onClick={() => navigate("today")}>Today</button>
      <button type="button" className="button ghost small" data-view-nav="next-week" onClick={() => navigate("next-week")}>Next week</button>
    </div>
    <nav className="week-strip" aria-label="Week">
      {weekOf(active).map(day => <a key={dayKey(day)} href={`#${dayKey(day)}`} aria-current={dayKey(day) === activeDay ? "date" : undefined}
        onClick={(event) => { event.preventDefault(); goToDay(day); }}>
        <span>{labels.weekday(day)}</span><span>{day.getDate()}</span>
      </a>)}
    </nav>
    <div ref={list} className="upcoming-scroll" tabIndex={-1}>
      {overdue.length > 0 && <section>
        <button type="button" className="section-toggle" aria-expanded={overdueOpen} onClick={() => setOverdueOpen(open => !open)}>
          <ChevronDown className={overdueOpen ? "" : "closed"} />Overdue<span className="muted-count">{overdue.length}</span>
        </button>
        {overdueOpen && overdue.map(slots.row)}
      </section>}
      {days.map(({ day, key, tasks: dayTasks }) => <section key={key} id={key}>
        <h2 className="section-heading muted">{labels.day(day, now)}</h2>
        {eventDays.get(key)?.map(event => <EventRow key={event.id} event={event} />)}
        {dayTasks.map(slots.row)}
        {composer(day)}
      </section>)}
      {later.length > 0 && <section><h2 className="section-heading muted">Later</h2>{later.map(slots.row)}</section>}
    </div>
  </div>;
}

function TaskChip({ task, slots }: { task: TaskDto; slots: ScheduleSlots }) {
  return <button type="button" className="task-chip" onClick={(event) => { event.stopPropagation(); slots.open(task); }}>{task.title}</button>;
}

/** Legacy AllDayRow: complete, open and (on hover) delete. */
function AllDayRow({ task, slots }: { task: TaskDto; slots: ScheduleSlots }) {
  const done = task.status === "done";
  return <div className="all-day-row">
    <button type="button" role="checkbox" aria-checked={done} aria-label={`Complete ${task.title}`} className="round-check" onClick={() => slots.complete(task)} />
    <button type="button" className={done ? "all-day-title done" : "all-day-title"} onClick={() => slots.open(task)}>{task.title}</button>
    <button type="button" className="icon-button row-delete" aria-label={`Delete ${task.title}`} onClick={() => slots.remove(task)}><X /></button>
  </div>;
}

function CurrentTimeLine({ days, template }: { days: Date[]; template: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  return <div className="now-line" style={{ top: offsetFor(now), gridTemplateColumns: template }} aria-hidden="true">
    <span className="now-label">{labels.time(now)}</span>
    {days.map(day => <span key={dayKey(day)} className={sameDay(day, now) ? "now-mark today" : "now-mark"} />)}
  </div>;
}

/** Shared column template so header, all-day row, hour lines and columns align. */
const gridTemplate = (days: Date[]) => `3rem repeat(${days.length}, minmax(0, 1fr))`;

/** Legacy ScheduleGrid: 48px hours, timed blocks, click-to-add slots, now line. */
function ScheduleGrid({ days, byDay, eventDays, slots, header }: { days: Date[]; byDay: Map<string, TaskDto[]>; eventDays: Map<string, CalendarEventDto[]>; slots: ScheduleSlots; header: ReactNode }) {
  const scroll = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  const template = gridTemplate(days);
  // Fill the viewport below the grid (legacy), at least 300px.
  useLayoutEffect(() => {
    const update = () => { if (scroll.current) setHeight(Math.max(window.innerHeight - scroll.current.getBoundingClientRect().top - 24, 300)); };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  // Centre on now once, after the first measured height.
  const centred = useRef(false);
  useEffect(() => {
    const container = scroll.current;
    if (!container || centred.current) return;
    centred.current = true;
    container.scrollTop = Math.max(offsetFor(new Date()) - (container.clientHeight - (head.current?.offsetHeight ?? 0)) / 2, 0);
  }, [height]);
  const blocks = slots.blocks;
  const columns = useRef<HTMLDivElement>(null);
  // Ranges shown while a block is dragged and until its write settles (task writes are not optimistic).
  const [moves, setMoves] = useState<ReadonlyMap<string, { start: Date; end: Date }>>(new Map());
  const [ghost, setGhost] = useState<{ start: Date; end: Date } | null>(null);
  // A drag ends in a click on the block or column; that click must not open anything.
  const dragged = useRef(false);
  const click = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if (dragged.current) return;
    const { start, end } = slotAt(day, event.clientY - event.currentTarget.getBoundingClientRect().top);
    slots.slot(start, end);
  };
  const dayIndex = (x: number) => [...columns.current?.querySelectorAll<HTMLElement>("[data-day]") ?? []]
    .findIndex(column => { const rect = column.getBoundingClientRect(); return x >= rect.left && x < rect.right; });
  /** Follows the pointer until release: `dy` px and columns moved; `done(false)` was a click. */
  function track(event: ReactPointerEvent, move: (dy: number, shift: number) => void, done: (moved: boolean) => void) {
    const x0 = event.clientX, y0 = event.clientY, from = dayIndex(x0);
    let moved = false;
    const onMove = (next: PointerEvent) => {
      if (!moved && Math.abs(next.clientY - y0) < DRAG_THRESHOLD && Math.abs(next.clientX - x0) < DRAG_THRESHOLD) return;
      moved = true;
      const to = dayIndex(next.clientX);
      move(next.clientY - y0, to < 0 || from < 0 ? 0 : to - from);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (moved) { dragged.current = true; setTimeout(() => { dragged.current = false; }); }
      done(moved);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
  // Mouse and pen only: a finger on an empty slot scrolls the schedule.
  const createDown = (day: Date, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!blocks || event.button !== 0 || event.pointerType === "touch" || event.target !== event.currentTarget) return;
    const y0 = event.clientY - event.currentTarget.getBoundingClientRect().top;
    let range: { start: Date; end: Date } | null = null;
    track(event, dy => setGhost(range = rangeAt(day, y0, y0 + dy)), moved => { setGhost(null); if (moved && range) blocks.create(range.start, range.end); });
  };
  const itemDown = (item: ScheduleItem, mode: "move" | "resize", event: ReactPointerEvent) => {
    if (!blocks || event.button !== 0) return;
    event.stopPropagation();
    let range: { start: Date; end: Date } | null = null;
    const show = (value: { start: Date; end: Date } | null) => setMoves(current => {
      const next = new Map(current);
      if (value) next.set(item.key, value); else next.delete(item.key);
      return next;
    });
    track(event, (dy, shift) => show(range = dragRange(mode, item.start, item.end, dy, mode === "move" ? shift : 0)), moved => {
      if (!moved || !range) return show(null);
      void blocks.change(item, range.start, range.end).catch(() => {}).finally(() => show(null));
    });
  };
  const open = (item: ScheduleItem) => { if (dragged.current) return; if (item.block) blocks?.open(item.block); else if (item.task) slots.open(item.task); };
  // Every visible item placed by its (possibly dragged) start, so a block moved to another day lands there.
  const items = [
    ...(blocks?.blocks ?? []).map(block => blockItem(block, blocks?.goal(block.goalId))),
    ...days.flatMap(day => (byDay.get(dayKey(day)) ?? []).filter(isTimed)).map(task => taskItem(task, blocks?.taskColor(task) ?? null)),
  ].map(item => ({ ...item, ...moves.get(item.key) }));
  const itemsOn = (day: Date) => items.filter(item => sameDay(item.start, day));
  const newBlock = () => {
    const today = days.find(day => sameDay(day, new Date())) ?? days[0]!;
    const { start, end } = defaultBlockRange(today);
    blocks?.create(start, end);
  };

  return <>
    {blocks && <div className="ui flex items-start justify-end gap-2 pb-2">
      {blocks.summary && <div className="mr-auto min-w-0">{blocks.summary}</div>}
      {blocks.toolbar}
      <Button type="button" variant="outline" size="sm" data-schedule-action="new-block" onClick={newBlock}>Block time</Button>
    </div>}
    <div ref={scroll} className="schedule" style={{ height }}>
    <div ref={head} className="schedule-head">{header}</div>
    <div className="schedule-body" style={{ height: 24 * HOUR_HEIGHT }}>
      {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="hour-line" style={{ top: hour * HOUR_HEIGHT, gridTemplateColumns: template }}>
        <span>{String(hour).padStart(2, "0")}:00</span>{days.map(day => <span key={dayKey(day)} className="rule" />)}
      </div>)}
      {/* ponytail: no overlap layout for simultaneous blocks (legacy neither); add columns if overlaps become common. */}
      <div ref={columns} className="schedule-columns" style={{ gridTemplateColumns: template }}>
        <div />
        {days.map(day => <div key={dayKey(day)} className="schedule-column select-none data-[drop-target]:bg-selected" data-day={dayKey(day)} onClick={(event) => click(day, event)} onPointerDown={(event) => createDown(day, event)}>
          {(eventDays.get(dayKey(day)) ?? []).filter(event => !event.allDay).map(event => <EventBlock key={event.id} event={event} />)}
          {itemsOn(day).map(item => <BlockView key={item.key} item={item} tasks={item.block ? blocks?.tasksIn(item.block) : undefined} draggable={Boolean(blocks)} onOpen={() => open(item)} onDrag={(mode, event) => itemDown(item, mode, event)} />)}
          {ghost && sameDay(ghost.start, day) && <div aria-hidden="true" className="timed-block pointer-events-none z-[2] border border-dashed border-primary bg-transparent" style={spanFor(ghost.start, ghost.end)}>
            <span className="timed-range">{labels.time(ghost.start)}–{labels.time(ghost.end)}</span>
          </div>}
        </div>)}
      </div>
      <CurrentTimeLine days={days} template={template} />
    </div>
  </div>
  </>;
}

/**
 * One block on the grid, in its goal's colour: a time block or a scheduled task
 * (a block holding just that task). Drag to move, drag the bottom edge to resize;
 * Enter or a click opens it.
 */
function BlockView({ item, tasks = [], draggable, onOpen, onDrag }: { item: ScheduleItem; tasks?: TaskDto[]; draggable: boolean; onOpen: () => void; onDrag: (mode: "move" | "resize", event: ReactPointerEvent) => void }) {
  // Ticket 09: skipped blocks fade; a reschedule count shows whatever the outcome.
  const outcome = item.block?.outcome, rescheduled = item.block?.rescheduleCount ?? 0;
  const note = [outcome === "skipped" && "Skipped", rescheduled > 0 && `Rescheduled ${rescheduled}×`].filter(Boolean).join(" · ");
  const tone = item.color ? { borderLeft: `3px solid ${item.color}`, backgroundColor: `color-mix(in srgb, ${item.color} 18%, transparent)` } : {};
  return <button type="button" className={cn("timed-block z-[1] data-[drop-target]:ring-2 data-[drop-target]:ring-ring", draggable && "touch-none", item.block && !item.color && "border-l-[3px] border-solid border-border", outcome === "skipped" && "opacity-50")}
    data-block={item.block ? "time-block" : "task"} data-time-block-id={item.block?.id} data-outcome={outcome} data-done={item.done || undefined} style={{ ...spanFor(item.start, item.end), ...tone }}
    onClick={(event) => { event.stopPropagation(); onOpen(); }} onPointerDown={draggable ? (event) => onDrag("move", event) : undefined}>
    <span className="timed-title">{item.title}</span><span className="timed-range">{labels.time(item.start)}–{labels.time(item.end)}</span>
    {note && <span data-block-note="" className="truncate text-xs text-muted-foreground">{note}</span>}
    {tasks.map(task => <span key={task.id} data-block-task={task.id} className={cn("truncate text-xs", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>)}
    {draggable && <span aria-hidden="true" data-resize="" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(event) => onDrag("resize", event)} />}
  </button>;
}

/** Today's calendar layout (legacy TodayScheduleView): overdue and all-day tasks above the hours. */
export function TodaySchedule({ tasks, events = [], slots, now = new Date() }: { tasks: TaskDto[]; events?: CalendarEventDto[]; slots: ScheduleSlots; now?: Date }) {
  const { showCompleted } = useDisplay();
  const shown = tasks.filter(task => onCalendar(task, showCompleted));
  const today = shown.filter(task => isDueToday(task, now));
  const allDay = [...shown.filter(task => isOverdue(task, now) && (showCompleted || task.status !== "done")), ...today.filter(task => !isTimed(task))];
  const todayEvents = eventsByDay(events).get(dayKey(now)) ?? [];
  return <ScheduleGrid days={[startOfDay(now)]} byDay={new Map([[dayKey(now), today]])} eventDays={new Map([[dayKey(now), todayEvents]])} slots={slots} header={
    <div className="all-day single"><span className="all-day-label">All day</span><div className="all-day-cell">
      {todayEvents.filter(event => event.allDay).map(event => <EventRow key={event.id} event={event} />)}
      {allDay.map(task => <AllDayRow key={task.id} task={task} slots={slots} />)}
    </div></div>
  } />;
}

function WeekSchedule({ tasks, events, anchor, onNavigate, slots, now }: { tasks: TaskDto[]; events: CalendarEventDto[]; anchor: Date; onNavigate: (action: ViewDateAction) => void; slots: ScheduleSlots; now: Date }) {
  const { showCompleted } = useDisplay();
  const days = weekOf(anchor);
  const byDay = tasksByDay(tasks, showCompleted);
  const eventDays = eventsByDay(events);
  const template = gridTemplate(days);
  return <div>
    <div className="calendar-nav">
      <button type="button" className="button outline small" data-view-nav="previous-week" onClick={() => onNavigate("previous-week")}>Prev</button>
      <div className="calendar-title"><h2 aria-live="polite">{labels.week(days[0])}</h2><button type="button" className="button ghost small" data-view-nav="today" onClick={() => onNavigate("today")}>Today</button></div>
      <button type="button" className="button outline small" data-view-nav="next-week" onClick={() => onNavigate("next-week")}>Next</button>
    </div>
    <ScheduleGrid days={days} byDay={byDay} eventDays={eventDays} slots={slots} header={<>
      <div className="week-days" style={{ gridTemplateColumns: template }}><div />
        {days.map(day => <div key={dayKey(day)} className={sameDay(day, now) ? "today" : undefined}>{labels.weekday(day)} {day.getDate()}</div>)}
      </div>
      <div className="all-day" style={{ gridTemplateColumns: template }}><span className="all-day-label">All day</span>
        {days.map(day => <div key={dayKey(day)} className="all-day-cell">
          {(eventDays.get(dayKey(day)) ?? []).filter(event => event.allDay).map(event => <EventRow key={event.id} event={event} />)}
          {(byDay.get(dayKey(day)) ?? []).filter(task => !isTimed(task)).map(task => <AllDayRow key={task.id} task={task} slots={slots} />)}
        </div>)}
      </div>
    </>} />
  </div>;
}

function MonthGrid({ tasks, events, month, setMonth, onNavigate, slots, now }: { tasks: TaskDto[]; events: CalendarEventDto[]; month: Date; setMonth: (month: Date) => void; onNavigate: (action: ViewDateAction) => void; slots: ScheduleSlots; now: Date }) {
  const { showCompleted } = useDisplay();
  const byDay = tasksByDay(tasks, showCompleted);
  const eventDays = eventsByDay(events);
  const weekStart = startOfWeek(month, 1);
  const weekEnd = addDays(weekStart, 6);
  return <div>
    <div className="calendar-nav">
      <button type="button" className="button outline small" onClick={() => setMonth(addMonths(month, -1))}>Prev</button>
      <div className="calendar-title"><h2 aria-live="polite">{labels.month(month)}</h2><span className="week-of">Week of {labels.monthDay(weekStart)}</span></div>
      <button type="button" className="button outline small" onClick={() => setMonth(addMonths(month, 1))}>Next</button>
    </div>
    <div className="week-nav">
      <button type="button" className="button ghost small" data-view-nav="previous-week" onClick={() => onNavigate("previous-week")}>Previous week</button>
      <button type="button" className="button outline small" data-view-nav="today" onClick={() => onNavigate("today")}>Today</button>
      <button type="button" className="button ghost small" data-view-nav="next-week" onClick={() => onNavigate("next-week")}>Next week</button>
    </div>
    <div className="month-grid">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(name => <div key={name} className="month-weekday">{name}</div>)}
      {monthGrid(month).map(day => {
        const classes = ["month-day", day.getMonth() === month.getMonth() ? "" : "outside", day >= weekStart && day <= weekEnd ? "current-week" : ""].filter(Boolean).join(" ");
        return <div key={dayKey(day)} className={classes}>
          <div className={sameDay(day, now) ? "month-date today" : "month-date"}>{day.getDate()}</div>
          {eventDays.get(dayKey(day))?.map(event => <EventChip key={event.id} event={event} />)}
          {(byDay.get(dayKey(day)) ?? []).map(task => <TaskChip key={task.id} task={task} slots={slots} />)}
        </div>;
      })}
    </div>
  </div>;
}

/** Legacy CalendarView: one anchor date shared by month and week, Week/Month from Display. */
export function CalendarView({ tasks, events = [], slots, now = new Date() }: { tasks: TaskDto[]; events?: CalendarEventDto[]; slots: ScheduleSlots; now?: Date }) {
  const { calendarRange } = useDisplay();
  const [anchor, setAnchor] = useState(now);
  const navigate = (action: ViewDateAction) => setAnchor(current => navigateViewDate(current, action, new Date()));
  return <div aria-label="Calendar view" className="calendar">{calendarRange === "week"
    ? <WeekSchedule tasks={tasks} events={events} anchor={anchor} onNavigate={navigate} slots={slots} now={now} />
    : <MonthGrid tasks={tasks} events={events} month={anchor} setMonth={setAnchor} onNavigate={navigate} slots={slots} now={now} />}</div>;
}

