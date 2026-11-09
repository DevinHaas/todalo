// Upcoming list, month/week calendar and daily schedule (ticket 16): the legacy
// UpcomingListView, CalendarView, WeekScheduleView, TodayScheduleView and
// ScheduleGrid. Pure views (no runtime imports): screens pass rows, composers
// and handlers. Provider events (ticket 20) render first in each day, as legacy.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, LayoutGrid, List, X } from "lucide-react";
import { isDueToday, isOverdue, type TaskDto } from "./tasks";
import {
  DRAG_THRESHOLD, HOUR_HEIGHT, addDays, addMonths, blockFor, dayKey, dragRange, dropRange, durationOf, overlapColumns, rangeAt, spanFor, taskItem, defaultDisplay, extendWindow, isTimed, labels, monthGrid, navigateViewDate,
  nextLayout, offsetFor, onCalendar, parseDayKey, sameDay, slotAt, startOfDay, startOfWeek, tasksByDay, upcomingSections, upcomingWindow, weekOf,
  type DisplaySettings, type ScheduleItem, type ViewDateAction,
} from "./schedule";
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
  /** A clicked schedule slot (or one dragged over): opens the composer with that date and time range. */
  slot(start: Date, end: Date): void;
  /** Goals ticket 07: dragging tasks on the today and week schedule; absent, task blocks only open on click. */
  planner?: PlannerSlots;
}

/** A sidebar task dragged over a day column: its key and the pointer's offset in it (px). */
export interface IncomingTask { task: TaskDto; day: string; y: number }

/**
 * Time blocks (goals ticket 07, reworked): every task with a time is a block.
 * Move or resize it, drag it onto the Plan sidebar, or drop a sidebar task on a slot.
 */
export interface PlannerSlots {
  /** The CSS colour of the task's first goal (sidebar order), if any. */
  taskColor(task: TaskDto): string | null;
  /** A moved or resized task's new range; settles once saved or refused. */
  change(task: TaskDto, start: Date, end: Date): Promise<unknown>;
  /** Dropped on the Plan sidebar: clears its time. */
  unschedule(task: TaskDto): void;
  /** A sidebar task being dragged over the grid (its ghost shows there). */
  incoming?: IncomingTask | null;
  /** Controls above the grid (the Plan sidebar toggle). */
  toolbar?: ReactNode;
  /** Ticket 19: a Coach draft's pending items, shown dashed until accepted. */
  draft?: DraftBlock[];
  /** Ticket 20: the week calendar reports the Monday it shows (the week the Coach drafts). */
  week?(start: Date): void;
}

/** One pending draft item on the grid: where it puts the task (add, move) or which block it takes off (remove). */
export interface DraftBlock { itemId: string; /** Ticket 30: complete and delete mark the task's own block. */ op: "add" | "move" | "remove" | "complete" | "delete"; taskId: string | null; title: string; start: Date; end: Date | null; color: string | null }

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
  return <button type="button" className="task-chip" data-task-id={task.id} onClick={(event) => { event.stopPropagation(); slots.open(task); }}>{task.title}</button>;
}

/** Legacy AllDayRow: complete, open and (on hover) delete. */
function AllDayRow({ task, slots }: { task: TaskDto; slots: ScheduleSlots }) {
  const done = task.status === "done";
  return <div className="all-day-row" data-task-id={task.id}>
    <button type="button" role="checkbox" aria-checked={done} aria-label={`Complete ${task.title}`} className="round-check" onClick={() => slots.complete(task)} />
    <button type="button" className={done ? "all-day-title done" : "all-day-title"} title={task.title} onClick={() => slots.open(task)}>{task.title}</button>
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
  const template = gridTemplate(days);
  // Centre on now once. The grid's height is CSS: it fills the screen below the page (styles.css, "One screen").
  useEffect(() => {
    const container = scroll.current;
    if (container) container.scrollTop = Math.max(offsetFor(new Date()) - (container.clientHeight - (head.current?.offsetHeight ?? 0)) / 2, 0);
  }, []);
  const planner = slots.planner;
  const columns = useRef<HTMLDivElement>(null);
  // Ranges kept after a drop until the write settles (task writes are not optimistic).
  const [saving, setSaving] = useState<ReadonlyMap<string, Range>>(new Map());
  // The live preview: where the dragged (or new) task lands, snapped to the grid.
  const [ghost, setGhost] = useState<Ghost | null>(null);
  // A drag ends in a click on the block or column; that click must not open anything.
  const dragged = useRef(false);
  const click = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    if (dragged.current) return;
    const { start, end } = slotAt(day, event.clientY - event.currentTarget.getBoundingClientRect().top);
    slots.slot(start, end);
  };
  const dayIndex = (x: number) => [...columns.current?.querySelectorAll<HTMLElement>("[data-day]") ?? []]
    .findIndex(column => { const rect = column.getBoundingClientRect(); return x >= rect.left && x < rect.right; });
  /** Follows the pointer until release: `dy` px and columns moved, and where it is; `done(false)` was a click. */
  function track(event: ReactPointerEvent, move: (dy: number, shift: number, x: number, y: number) => void, done: (moved: boolean) => void) {
    const x0 = event.clientX, y0 = event.clientY, from = dayIndex(x0);
    let moved = false;
    const onMove = (next: PointerEvent) => {
      if (!moved && Math.abs(next.clientY - y0) < DRAG_THRESHOLD && Math.abs(next.clientX - x0) < DRAG_THRESHOLD) return;
      moved = true;
      const to = dayIndex(next.clientX);
      move(next.clientY - y0, to < 0 || from < 0 ? 0 : to - from, next.clientX, next.clientY);
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
  // Mouse and pen only: a finger on an empty slot scrolls the schedule. The range opens the composer, like a click.
  const createDown = (day: Date, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!planner || event.button !== 0 || event.pointerType === "touch" || event.target !== event.currentTarget) return;
    const y0 = event.clientY - event.currentTarget.getBoundingClientRect().top;
    let range: Range | null = null;
    track(event, dy => setGhost({ ...(range = rangeAt(day, y0, y0 + dy)), title: "New task", color: null }), moved => { setGhost(null); if (moved && range) slots.slot(range.start, range.end); });
  };
  const itemDown = (item: ScheduleItem, mode: "move" | "resize", event: ReactPointerEvent) => {
    if (!planner || event.button !== 0) return;
    event.stopPropagation();
    let range: Range | null = null;
    let sidebar: HTMLElement | null = null;
    const mark = (target: HTMLElement | null) => { if (target === sidebar) return; sidebar?.removeAttribute("data-drop-target"); target?.setAttribute("data-drop-target", ""); sidebar = target; };
    track(event, (dy, shift, x, y) => {
      // Moved onto the Plan sidebar: releasing there unschedules the task.
      mark(mode === "move" ? sidebarAt(x, y) : null);
      range = sidebar ? null : dragRange(mode, item.start, item.end, dy, mode === "move" ? shift : 0);
      setGhost(range && { ...range, title: item.title, color: item.color, key: item.key });
    }, moved => {
      const out = sidebar !== null;
      mark(null);
      setGhost(null);
      if (!moved) return;
      if (out) return planner.unschedule(item.task);
      if (!range) return;
      const kept = range;
      setSaving(current => new Map(current).set(item.key, kept));
      void planner.change(item.task, kept.start, kept.end).catch(() => {}).finally(() => setSaving(current => { const next = new Map(current); next.delete(item.key); return next; }));
    });
  };
  const open = (item: ScheduleItem) => { if (!dragged.current) slots.open(item.task); };
  // Every timed task placed by its (possibly just dropped) start, so one moved to another day lands there.
  const items = days.flatMap(day => (byDay.get(dayKey(day)) ?? []).filter(isTimed))
    .map(task => taskItem(task, planner?.taskColor(task) ?? null)).map(item => ({ ...item, ...saving.get(item.key) }));
  // A sidebar task dragged over a column: its ghost at the snapped slot, for its own duration.
  const incoming = planner?.incoming;
  const drafted = planner?.draft ?? [];
  // A task the draft moves fades at its old time; one it removes shows dashed and struck through.
  const draftOf = new Map(drafted.flatMap(block => block.taskId && block.op !== "add" ? [[block.taskId, block.op as Exclude<DraftBlock["op"], "add">] as const] : []));
  const shown = ghost ?? (incoming ? { ...dropRange(parseDayKey(incoming.day), incoming.y, durationOf(incoming.task)), title: incoming.task.title, color: planner.taskColor(incoming.task) } : null);

  return <>
    {planner?.toolbar && <div className="ui flex items-start justify-end gap-2 pb-2">{planner.toolbar}</div>}
    <div ref={scroll} className="schedule scrollbar-subtle">
    <div ref={head} className="schedule-head">{header}</div>
    <div className="schedule-body" style={{ height: 24 * HOUR_HEIGHT }}>
      {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="hour-line" style={{ top: hour * HOUR_HEIGHT, gridTemplateColumns: template }}>
        <span>{String(hour).padStart(2, "0")}:00</span>{days.map(day => <span key={dayKey(day)} className="rule" />)}
      </div>)}
      <div ref={columns} className="schedule-columns" style={{ gridTemplateColumns: template }}>
        <div />
        {days.map(day => {
          const events = (eventDays.get(dayKey(day)) ?? []).filter(event => !event.allDay);
          const tasks = items.filter(item => sameDay(item.start, day));
          const placed = drafted.filter(block => block.end && sameDay(block.start, day)) as (DraftBlock & { end: Date })[];
          // Overlapping events, tasks and drafted blocks sit side by side.
          const layout = overlapColumns([...events.map(event => blockFor(event.start, event.end)), ...tasks, ...placed]);
          return <div key={dayKey(day)} className="schedule-column select-none" data-day={dayKey(day)} onClick={(event) => click(day, event)} onPointerDown={(event) => createDown(day, event)}>
            {events.map((event, index) => <EventBlock key={event.id} event={event} style={sideBySide(layout[index]!)} />)}
            {tasks.map((item, index) => <BlockView key={item.key} item={item} style={sideBySide(layout[events.length + index]!)} draggable={Boolean(planner)} lifted={ghost?.key === item.key}
              draft={draftOf.get(item.task.id)} onOpen={() => open(item)} onDrag={(mode, event) => itemDown(item, mode, event)} />)}
            {placed.map((block, index) => <div key={block.itemId} data-draft-block={block.op} data-draft-item={block.itemId} role="img"
              aria-label={`Draft: ${block.op === "add" ? "add" : "move"} ${block.title}, ${labels.time(block.start)}–${labels.time(block.end)}`}
              className="timed-block pointer-events-none z-[1] border border-dashed border-primary"
              // Ticket 29: dashed all round in the goal's colour.
              style={{ ...spanFor(block.start, block.end), ...tone(block.color), ...(block.color && { borderLeft: undefined, borderColor: block.color }), ...sideBySide(layout[events.length + tasks.length + index]!) }}>
              <span className="timed-title">{block.title}</span><span className="timed-range">{labels.time(block.start)}–{labels.time(block.end)}</span>
            </div>)}
            {shown && sameDay(shown.start, day) && <div aria-hidden="true" data-ghost="" className="timed-block pointer-events-none z-[2] border border-dashed border-primary shadow-popover"
              style={{ ...spanFor(shown.start, shown.end), ...tone(shown.color) }}>
              <span className="timed-title">{shown.title}</span><span className="timed-range">{labels.time(shown.start)}–{labels.time(shown.end)}</span>
            </div>}
          </div>;
        })}
      </div>
      <CurrentTimeLine days={days} template={template} />
    </div>
  </div>
  </>;
}

type Range = { start: Date; end: Date };
/** The Plan sidebar's column under the pointer (anywhere below its top, however short its list). */
const sidebarAt = (x: number, y: number) => {
  const sidebar = document.querySelector<HTMLElement>("main [data-plan]");
  const rect = sidebar?.getBoundingClientRect();
  return rect && x >= rect.left && x <= rect.right && y >= rect.top ? sidebar! : null;
};
type Ghost = Range & { title: string; color: string | null; key?: string };
/** Column `column` of `columns` across the day column; the full width when alone. */
const sideBySide = ({ column, columns }: { column: number; columns: number }): CSSProperties => columns > 1
  ? { left: `calc(${(column / columns) * 100}% + 0.125rem)`, width: `calc(${100 / columns}% - 0.25rem)`, right: "auto" } : {};
/** A task block's goal colour: a left edge and a light tint; the neutral task colour without a goal. */
const tone = (color: string | null): CSSProperties => color ? { borderLeft: `3px solid ${color}`, backgroundColor: `color-mix(in srgb, ${color} 18%, var(--color-background))` } : {};

/**
 * One scheduled task on the grid, in its goal's colour. Drag to move, drag the
 * bottom edge to resize; Enter or a click opens it, right-click opens its menu.
 */
function BlockView({ item, style, draggable, lifted, draft, onOpen, onDrag }: { item: ScheduleItem; style: CSSProperties; draggable: boolean; lifted: boolean; draft?: Exclude<DraftBlock["op"], "add">; onOpen: () => void; onDrag: (mode: "move" | "resize", event: ReactPointerEvent) => void }) {
  // Tailwind's button reset outranks the legacy .timed-block layout and fill, so they are restated here.
  return <button type="button" className={cn("timed-block z-[1] flex flex-col justify-start bg-muted text-left", draggable && "touch-none", (lifted || draft === "move") && "opacity-40",
    // Ticket 29: a removed block is grey, dashed, hatched and struck through.
    draft === "remove" && "border border-dashed border-border-strong bg-hatched opacity-60 [&_.timed-title]:line-through",
    // Ticket 30: one to delete is red, dashed and struck through; one to complete looks done (styles.css).
    draft === "delete" && "border border-dashed border-destructive opacity-70 [&_.timed-title]:text-destructive [&_.timed-title]:line-through")}
    data-block="task" data-task-id={item.task.id} data-done={item.done || undefined} data-draft={draft} style={{ ...spanFor(item.start, item.end), ...(draft !== "remove" && draft !== "delete" && tone(item.color)), ...style }}
    onClick={(event) => { event.stopPropagation(); onOpen(); }} onPointerDown={draggable ? (event) => onDrag("move", event) : undefined}>
    <span className="timed-title">{item.title}</span><span className="timed-range">{labels.time(item.start)}–{labels.time(item.end)}</span>
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
  const shownWeek = dayKey(days[0]!);
  useEffect(() => { slots.planner?.week?.(parseDayKey(shownWeek)); }, [shownWeek]); // eslint-disable-line react-hooks/exhaustive-deps
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

const SHOW_DAY = "todalo:calendar-day";
let shownDay: Date | null = null;
/**
 * Puts the calendar on `day`'s week (the Weekly review's planning step, ticket 13).
 * Kept until a calendar takes it, so it also works when the calendar mounts after the call.
 */
export const showCalendarDay = (day: Date) => { shownDay = day; window.dispatchEvent(new Event(SHOW_DAY)); };
const takeShownDay = () => { const day = shownDay; shownDay = null; return day; };

/** Legacy CalendarView: one anchor date shared by month and week, Week/Month from Display. */
export function CalendarView({ tasks, events = [], slots, now = new Date() }: { tasks: TaskDto[]; events?: CalendarEventDto[]; slots: ScheduleSlots; now?: Date }) {
  const { calendarRange } = useDisplay();
  const [anchor, setAnchor] = useState(() => takeShownDay() ?? now);
  useEffect(() => {
    const show = () => { const day = takeShownDay(); if (day) setAnchor(day); };
    window.addEventListener(SHOW_DAY, show);
    return () => window.removeEventListener(SHOW_DAY, show);
  }, []);
  const navigate = (action: ViewDateAction) => setAnchor(current => navigateViewDate(current, action, new Date()));
  return <div aria-label="Calendar view" className="calendar">{calendarRange === "week"
    ? <WeekSchedule tasks={tasks} events={events} anchor={anchor} onNavigate={navigate} slots={slots} now={now} />
    : <MonthGrid tasks={tasks} events={events} month={anchor} setMonth={setAnchor} onNavigate={navigate} slots={slots} now={now} />}</div>;
}

