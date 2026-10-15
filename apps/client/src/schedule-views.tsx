// Upcoming list, month/week calendar and daily schedule (ticket 16): the legacy
// UpcomingListView, CalendarView, WeekScheduleView, TodayScheduleView and
// ScheduleGrid. Pure views (no runtime imports): screens pass rows, composers
// and handlers. Ticket 20 adds provider events beside tasks at each "events" note.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, LayoutGrid, List, X } from "lucide-react";
import { isDueToday, isOverdue, type TaskDto } from "./tasks";
import {
  HOUR_HEIGHT, addDays, addMonths, blockFor, dayKey, defaultDisplay, extendWindow, isTimed, labels, monthGrid, navigateViewDate,
  nextLayout, offsetFor, parseDayKey, sameDay, slotAt, startOfDay, startOfWeek, tasksByDay, upcomingSections, upcomingWindow, weekOf,
  type DisplaySettings, type ViewDateAction,
} from "./schedule";

type Display = DisplaySettings & { set(change: Partial<DisplaySettings>): void };
const DisplayContext = createContext<Display>({ ...defaultDisplay, set() {} });
/** Shell-wide, in memory: the legacy provider sat in the app layout, so settings survive navigation but not reloads. */
export function DisplayProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaultDisplay);
  return <DisplayContext.Provider value={{ ...settings, set: change => setSettings(current => ({ ...current, ...change })) }}>{children}</DisplayContext.Provider>;
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
/** Legacy Display dialog. Board is ticket 17; Sort/Filter rows were single-option stubs in legacy too. */
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
          <button type="button" aria-disabled="true"><LayoutGrid />Board</button>
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
}

/** Legacy UpcomingListView: week strip, scroll-spy and one section per day for a year. */
export function UpcomingList({ tasks, slots, composer, now = new Date() }: { tasks: TaskDto[]; slots: ScheduleSlots; composer: (day: Date) => ReactNode; now?: Date }) {
  const { showCompleted } = useDisplay();
  const [overdueOpen, setOverdueOpen] = useState(true);
  const [activeDay, setActiveDay] = useState(() => dayKey(now));
  const [range, setRange] = useState(() => upcomingWindow(now));
  const list = useRef<HTMLDivElement>(null);
  const { overdue, days, later } = upcomingSections(tasks, range, showCompleted, now);
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
      <button type="button" className="button ghost small" onClick={() => navigate("previous-week")}>Previous week</button>
      <button type="button" className="button outline small" onClick={() => navigate("today")}>Today</button>
      <button type="button" className="button ghost small" onClick={() => navigate("next-week")}>Next week</button>
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
      {/* Ticket 20: the day's provider events render first in each section. */}
      {days.map(({ day, key, tasks: dayTasks }) => <section key={key} id={key}>
        <h2 className="section-heading muted">{labels.day(day, now)}</h2>
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
function ScheduleGrid({ days, byDay, slots, header }: { days: Date[]; byDay: Map<string, TaskDto[]>; slots: ScheduleSlots; header: ReactNode }) {
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
  const click = (day: Date, event: MouseEvent<HTMLDivElement>) => {
    const { start, end } = slotAt(day, event.clientY - event.currentTarget.getBoundingClientRect().top);
    slots.slot(start, end);
  };

  return <div ref={scroll} className="schedule" style={{ height }}>
    <div ref={head} className="schedule-head">{header}</div>
    <div className="schedule-body" style={{ height: 24 * HOUR_HEIGHT }}>
      {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="hour-line" style={{ top: hour * HOUR_HEIGHT, gridTemplateColumns: template }}>
        <span>{String(hour).padStart(2, "0")}:00</span>{days.map(day => <span key={dayKey(day)} className="rule" />)}
      </div>)}
      {/* ponytail: no overlap layout for simultaneous blocks (legacy neither); add columns if overlaps become common. */}
      <div className="schedule-columns" style={{ gridTemplateColumns: template }}>
        <div />
        {days.map(day => <div key={dayKey(day)} className="schedule-column" data-day={dayKey(day)} onClick={(event) => click(day, event)}>
          {/* Ticket 20: timed provider events (blockFor(start, end)) render before tasks. */}
          {(byDay.get(dayKey(day)) ?? []).filter(isTimed).map(task => {
            const block = blockFor(task.dueDate!, task.dueDateEnd);
            return <button key={task.id} type="button" className="timed-block" style={{ top: block.top, height: block.height }}
              onClick={(event) => { event.stopPropagation(); slots.open(task); }}>
              <span className="timed-title">{task.title}</span><span className="timed-range">{labels.time(block.start)}–{labels.time(block.end)}</span>
            </button>;
          })}
        </div>)}
      </div>
      <CurrentTimeLine days={days} template={template} />
    </div>
  </div>;
}

/** Today's calendar layout (legacy TodayScheduleView): overdue and all-day tasks above the hours. */
export function TodaySchedule({ tasks, slots, now = new Date() }: { tasks: TaskDto[]; slots: ScheduleSlots; now?: Date }) {
  const { showCompleted } = useDisplay();
  const shown = showCompleted ? tasks : tasks.filter(task => task.status !== "done");
  const today = shown.filter(task => isDueToday(task, now));
  const allDay = [...shown.filter(task => isOverdue(task, now)), ...today.filter(task => !isTimed(task))];
  return <ScheduleGrid days={[startOfDay(now)]} byDay={new Map([[dayKey(now), today]])} slots={slots} header={
    <div className="all-day single"><span className="all-day-label">All day</span><div className="all-day-cell">
      {/* Ticket 20: all-day provider events first. */}
      {allDay.map(task => <AllDayRow key={task.id} task={task} slots={slots} />)}
    </div></div>
  } />;
}

function WeekSchedule({ tasks, anchor, onNavigate, slots, now }: { tasks: TaskDto[]; anchor: Date; onNavigate: (action: ViewDateAction) => void; slots: ScheduleSlots; now: Date }) {
  const { showCompleted } = useDisplay();
  const days = weekOf(anchor);
  const byDay = tasksByDay(tasks, showCompleted);
  const template = gridTemplate(days);
  return <div>
    <div className="calendar-nav">
      <button type="button" className="button outline small" onClick={() => onNavigate("previous-week")}>Prev</button>
      <div className="calendar-title"><h2 aria-live="polite">{labels.week(days[0])}</h2><button type="button" className="button ghost small" onClick={() => onNavigate("today")}>Today</button></div>
      <button type="button" className="button outline small" onClick={() => onNavigate("next-week")}>Next</button>
    </div>
    <ScheduleGrid days={days} byDay={byDay} slots={slots} header={<>
      <div className="week-days" style={{ gridTemplateColumns: template }}><div />
        {days.map(day => <div key={dayKey(day)} className={sameDay(day, now) ? "today" : undefined}>{labels.weekday(day)} {day.getDate()}</div>)}
      </div>
      <div className="all-day" style={{ gridTemplateColumns: template }}><span className="all-day-label">All day</span>
        {days.map(day => <div key={dayKey(day)} className="all-day-cell">
          {(byDay.get(dayKey(day)) ?? []).filter(task => !isTimed(task)).map(task => <AllDayRow key={task.id} task={task} slots={slots} />)}
        </div>)}
      </div>
    </>} />
  </div>;
}

function MonthGrid({ tasks, month, setMonth, onNavigate, slots, now }: { tasks: TaskDto[]; month: Date; setMonth: (month: Date) => void; onNavigate: (action: ViewDateAction) => void; slots: ScheduleSlots; now: Date }) {
  const { showCompleted } = useDisplay();
  const byDay = tasksByDay(tasks, showCompleted);
  const weekStart = startOfWeek(month, 1);
  const weekEnd = addDays(weekStart, 6);
  return <div>
    <div className="calendar-nav">
      <button type="button" className="button outline small" onClick={() => setMonth(addMonths(month, -1))}>Prev</button>
      <div className="calendar-title"><h2 aria-live="polite">{labels.month(month)}</h2><span className="week-of">Week of {labels.monthDay(weekStart)}</span></div>
      <button type="button" className="button outline small" onClick={() => setMonth(addMonths(month, 1))}>Next</button>
    </div>
    <div className="week-nav">
      <button type="button" className="button ghost small" onClick={() => onNavigate("previous-week")}>Previous week</button>
      <button type="button" className="button outline small" onClick={() => onNavigate("today")}>Today</button>
      <button type="button" className="button ghost small" onClick={() => onNavigate("next-week")}>Next week</button>
    </div>
    <div className="month-grid">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(name => <div key={name} className="month-weekday">{name}</div>)}
      {monthGrid(month).map(day => {
        const classes = ["month-day", day.getMonth() === month.getMonth() ? "" : "outside", day >= weekStart && day <= weekEnd ? "current-week" : ""].filter(Boolean).join(" ");
        return <div key={dayKey(day)} className={classes}>
          <div className={sameDay(day, now) ? "month-date today" : "month-date"}>{day.getDate()}</div>
          {/* Ticket 20: event chips first. */}
          {(byDay.get(dayKey(day)) ?? []).map(task => <TaskChip key={task.id} task={task} slots={slots} />)}
        </div>;
      })}
    </div>
  </div>;
}

/** Legacy CalendarView: one anchor date shared by month and week, Week/Month from Display. */
export function CalendarView({ tasks, slots, now = new Date() }: { tasks: TaskDto[]; slots: ScheduleSlots; now?: Date }) {
  const { calendarRange } = useDisplay();
  const [anchor, setAnchor] = useState(now);
  const navigate = (action: ViewDateAction) => setAnchor(current => navigateViewDate(current, action, new Date()));
  return <div aria-label="Calendar view" className="calendar">{calendarRange === "week"
    ? <WeekSchedule tasks={tasks} anchor={anchor} onNavigate={navigate} slots={slots} now={now} />
    : <MonthGrid tasks={tasks} month={anchor} setMonth={setAnchor} onNavigate={navigate} slots={slots} now={now} />}</div>;
}

