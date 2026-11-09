// The Plan sidebar (goals ticket 14c, replacing ticket 08's unscheduled
// sidebar and 14b's Check-in cards): Todoist's Plan panel beside the schedule.
// Overdue, Today, Next 7 days and Inbox, goal tasks first; a row is dragged
// onto a slot (with a ghost there), scheduled from its popover, or opened. A
// scheduled task dragged back onto the sidebar is unscheduled. While the
// Check-in runs it heads the same sidebar. Pure view: the screen passes rows and writes.
// Ticket 31: tasks without a date in Now, Next, Inbox (unsorted) and Later
// sections; Inbox and Later start collapsed, and each user's choice is kept
// (localStorage). Now warns when it needs more time than the week has free.
import { useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CalendarClock, CalendarDays, Check, ChevronDown, Ellipsis, GitBranch, Hash, Inbox, MessageSquare, Plus, X } from "lucide-react";
import {
  Button, ButtonGroup, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Field, FieldLabel, Hint, Input, List, Popover,
  PopoverContent, PopoverTrigger, Progress, RightSidebar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Toggle, cn,
} from "./ui";
import { GoalIcon } from "./goal-views";
import { goalColorValue } from "./goals";
import { DRAG_THRESHOLD, planGroupOrder, planGroupsClosed, type PlanGroup } from "./schedule";
import type { IncomingTask } from "./schedule-views";
import type { TaskDto } from "./tasks";

/** The schedule's day column under the pointer, if any. */
const columnAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day]") ?? null;

/**
 * Pointer drag from a sidebar row (mouse and pen; a finger scrolls the list).
 * Over a day column `over` says where (the schedule draws the task's ghost
 * there); elsewhere a title chip follows the pointer. Release over a column
 * calls `drop` with the column's day key and the offset in it.
 */
// Shared by every drag source (each Plan sidebar) so the schedule draws the ghost whichever started it.
let incoming: IncomingTask | null = null;
const watchers = new Set<() => void>();
const setOver = (next: IncomingTask | null) => { incoming = next; watchers.forEach(watcher => watcher()); };
const watch = (watcher: () => void) => { watchers.add(watcher); return () => { watchers.delete(watcher); }; };

export function useTaskDrag(drop: (task: TaskDto, day: string, y: number) => void) {
  const over = useSyncExternalStore(watch, () => incoming);
  const [chip, setChip] = useState<{ task: TaskDto; x: number; y: number } | null>(null);
  const start = (task: TaskDto, event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const x0 = event.clientX, y0 = event.clientY;
    let moved = false, at: IncomingTask | null = null;
    const onMove = (next: PointerEvent) => {
      if (!moved && Math.abs(next.clientX - x0) < DRAG_THRESHOLD && Math.abs(next.clientY - y0) < DRAG_THRESHOLD) return;
      moved = true;
      const column = columnAt(next.clientX, next.clientY);
      at = column ? { task, day: column.dataset.day!, y: next.clientY - column.getBoundingClientRect().top } : null;
      setOver(at);
      setChip(at ? null : { task, x: next.clientX, y: next.clientY });
    };
    const onUp = (end: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setOver(null);
      setChip(null);
      if (moved && at && end.type === "pointerup") drop(task, at.day, at.y);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const preview = chip && <div aria-hidden="true" className="ui pointer-events-none fixed z-50 max-w-sidebar truncate rounded-md border border-border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-popover"
    style={{ left: chip.x + 12, top: chip.y + 8 }}>{chip.task.title}</div>;
  return { start, over, preview };
}

/** One Plan row, ready to show. */
export interface PlanRowData {
  id: string; title: string;
  /** "Yesterday", "Today", "6 Nov 19:00-19:45" (shortDateLabel); empty without a date. */
  date: string; tone: "overdue" | "today" | "tomorrow" | null;
  subtasks: { done: number; total: number }; comments: number;
  /** null is the Inbox. */
  project: string | null;
  /** `color` is the goal palette key. */
  goal: { id: string; title: string; color: string; icon: string } | null;
  labels: { id: string; name: string }[];
  /** The suggested time today (HH:MM): the next free slot. */
  slot: string;
}
const groupTitles: Record<PlanGroup, string> = { overdue: "Overdue", today: "Today", week: "Next 7 days", now: "Now", next: "Next", inbox: "Inbox", later: "Later" };
/** Ticket 31: the sections the user collapsed, under `key` (default: Inbox and Later). */
function storedClosed(key: string | undefined): ReadonlySet<PlanGroup> {
  try {
    const saved: unknown = key ? JSON.parse(localStorage.getItem(key) ?? "null") : null;
    if (Array.isArray(saved)) return new Set(saved.filter((group): group is PlanGroup => planGroupOrder.includes(group)));
  } catch { /* private mode or a bad value: the defaults */ }
  return new Set(planGroupsClosed);
}
/** "45 min", "14 h" (ticket 31's Now warning). */
export const hoursLabel = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
const toneClass = { overdue: "text-destructive", today: "text-today", tomorrow: "text-attention" } as const;
const ALL = "all", INBOX = "inbox";

/** Above this many rows the Plan shows a search box and filter chips (14b's Check-in rule). */
export const planSearchFrom = 11;
/** Each chip is "goal:id" or "label:id". Text matches the title; chips OR within a kind, AND across kinds. */
export function filterPlan<T extends Pick<PlanRowData, "title" | "goal" | "labels">>(items: T[], text: string, chips: ReadonlySet<string>) {
  const needle = text.trim().toLowerCase();
  const picked = (kind: string) => [...chips].filter(chip => chip.startsWith(`${kind}:`)).map(chip => chip.slice(kind.length + 1));
  const goals = picked("goal"), tags = picked("label");
  return items.filter(item => (!needle || item.title.toLowerCase().includes(needle))
    && (!goals.length || (item.goal !== null && goals.includes(item.goal.id)))
    && (!tags.length || item.labels.some(label => tags.includes(label.id))));
}
/** The chips worth offering: only goals and labels some row has. */
export function planChips(items: Pick<PlanRowData, "goal" | "labels">[]) {
  const chips = new Map<string, string>();
  for (const item of items) if (item.goal) chips.set(`goal:${item.goal.id}`, item.goal.title);
  for (const item of items) for (const label of item.labels) chips.set(`label:${label.id}`, `@${label.name}`);
  return [...chips];
}

/** The Check-in heading the Plan sidebar (ticket 14c): progress, Skip, close, and Done at the bottom. */
export interface PlanRitual {
  status: "completed" | "skipped" | null; pending: boolean;
  onDone(): void; onSkip(): void; onClose(): void;
}

/** The running Check-in, set by its ritual screen and shown by whichever Plan sidebar is on screen. */
let ritual: PlanRitual | null = null;
const ritualWatchers = new Set<() => void>();
export const planRitual = {
  get: () => ritual,
  set(next: PlanRitual | null) { ritual = next; ritualWatchers.forEach(watcher => watcher()); },
  subscribe(watcher: () => void) { ritualWatchers.add(watcher); return () => { ritualWatchers.delete(watcher); }; },
};

export interface PlanSlots {
  onComplete(id: string): void; onOpen(id: string): void;
  onDragStart(id: string, event: ReactPointerEvent): void;
  /** Today at HH:MM, for the task's length. */
  onSchedule(id: string, time: string): void;
  /** A due date (YYYY-MM-DD), all day. */
  onDue(id: string, day: string): void;
  /** "+ Add task": the Inbox composer. */
  onAdd(): void;
  /** Overdue › Reschedule: every overdue row to today. */
  onReschedule(ids: string[]): void;
  onClose(): void;
}

function PlanRow({ row, slots, checkIn, onLeave }: { row: PlanRowData; slots: PlanSlots; checkIn: boolean; onLeave(): void }) {
  const [time, setTime] = useState(row.slot);
  const color = row.goal && goalColorValue(row.goal.color);
  const quiet = (event: ReactPointerEvent) => event.stopPropagation();
  return <li data-slot="plan-row" data-task-id={row.id} data-check-in-candidate={checkIn ? row.id : undefined}
    className="group/row flex cursor-grab touch-pan-y select-none items-start gap-2.5 border-b border-border-subtle py-2"
    onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("[data-no-drag]")) slots.onDragStart(row.id, event); }}>
    <button type="button" role="checkbox" aria-checked="false" aria-label={`Complete ${row.title}`} data-no-drag="" onClick={() => slots.onComplete(row.id)}
      className="group/check mt-0.5 grid size-4.5 shrink-0 cursor-pointer place-content-center rounded-full border border-subtle-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={color ? { borderColor: color, backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)` } : undefined}>
      <Check className="size-3 opacity-0 group-hover/check:opacity-60" style={color ? { color } : undefined} strokeWidth={3} />
    </button>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-start gap-1">
        <button type="button" className="task-title line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-sm [overflow-wrap:anywhere] outline-none hover:no-underline focus-visible:underline"
          onClick={() => slots.onOpen(row.id)}>{row.title}</button>
        <div className="-my-1 flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100" data-no-drag="" onPointerDown={quiet}>
          <Popover>
            <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`Schedule ${row.title}`} title="Schedule" data-plan-action="schedule" />}><CalendarClock /></PopoverTrigger>
            <PopoverContent align="end" className="w-60 gap-3 p-3">
              <Field><FieldLabel htmlFor={`plan-time-${row.id}`}>Today at</FieldLabel>
                <ButtonGroup>
                  <Input id={`plan-time-${row.id}`} type="time" required value={time} className="min-w-0 flex-1" onChange={event => { if (event.target.value) setTime(event.target.value); }} />
                  <Button type="button" variant="outline" onClick={() => slots.onSchedule(row.id, time)}>Schedule today</Button>
                </ButtonGroup>
              </Field>
              <Field><FieldLabel htmlFor={`plan-due-${row.id}`}>Due date</FieldLabel>
                <Input id={`plan-due-${row.id}`} type="date" onChange={event => { if (event.target.value) slots.onDue(row.id, event.target.value); }} />
              </Field>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label={`More for ${row.title}`} />}><Ellipsis /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => slots.onOpen(row.id)}>Open task</DropdownMenuItem>
              <DropdownMenuItem onClick={() => slots.onSchedule(row.id, row.slot)}>Schedule today at {row.slot}</DropdownMenuItem>
              {checkIn && <DropdownMenuItem onClick={onLeave}>Leave for now</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* The Check-in's keyboard seams (Alt+Shift+S, Alt+Shift+L): schedule at the suggested slot, leave. */}
      {checkIn && <><button type="button" hidden data-ritual-action="schedule" onClick={() => slots.onSchedule(row.id, time)}>Schedule {row.title} today at {time}</button>
        <button type="button" hidden data-ritual-action="leave" onClick={onLeave}>Leave {row.title}</button></>}
      <div className="flex min-w-0 items-center gap-2.5 text-xs text-muted-foreground [&_svg]:size-3 [&_svg]:shrink-0">
        {row.date && <span className={cn("flex shrink-0 items-center gap-1", row.tone && toneClass[row.tone])}><CalendarDays aria-hidden="true" />{row.date}</span>}
        {row.subtasks.total > 0 && <span className="flex shrink-0 items-center gap-0.5" aria-label={`Sub-tasks ${row.subtasks.done} of ${row.subtasks.total} done`}><GitBranch aria-hidden="true" />{row.subtasks.done}/{row.subtasks.total}</span>}
        {row.comments > 0 && <span className="flex shrink-0 items-center gap-0.5" aria-label={`${row.comments} comment${row.comments > 1 ? "s" : ""}`}><MessageSquare aria-hidden="true" />{row.comments}</span>}
        {row.goal && <span className="flex shrink-0" title={row.goal.title}><GoalIcon color={row.goal.color} icon={row.goal.icon} size="xs" /><span className="sr-only">Goal {row.goal.title}</span></span>}
        <span className="ml-auto flex min-w-0 items-center gap-1"><span className="truncate">{row.project ?? "Inbox"}</span>{row.project ? <Hash aria-hidden="true" /> : <Inbox aria-hidden="true" />}</span>
      </div>
    </div>
  </li>;
}

/**
 * The Plan sidebar. `ritual` (the Check-in) adds its header, progress and Done;
 * its "Leave" drops a row from this run only.
 */
export function PlanSidebar({ groups, projects, projectId, onProject, slots, ritual, coach, remember, nowLoad }: {
  groups: Record<PlanGroup, PlanRowData[]>;
  /** Ticket 31: the localStorage key keeping which sections the user collapsed. */
  remember?: string;
  /** Ticket 31: the Now tasks' minutes (30 without an estimate) and the open minutes left this week. */
  nowLoad?: { minutes: number; free: number };
  projects: { id: string; name: string }[];
  /** undefined: all projects; null: the Inbox. */
  projectId: string | null | undefined; onProject(projectId: string | null | undefined): void;
  slots: PlanSlots; ritual?: PlanRitual | null;
  /** Ticket 19: the Coach's draft of today (only with a provider connected). */
  coach?: ReactNode;
}) {
  const [closed, setClosed] = useState(() => storedClosed(remember));
  useEffect(() => {
    if (remember) try { localStorage.setItem(remember, JSON.stringify([...closed])); } catch { /* private mode: in memory only */ }
  }, [closed, remember]);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [text, setText] = useState("");
  const [chips, setChips] = useState<ReadonlySet<string>>(new Set());
  const all = planGroupOrder.flatMap(group => groups[group]).filter(row => !left.has(row.id));
  const searchable = all.length >= planSearchFrom;
  const shownIds = new Set((searchable ? filterPlan(all, text, chips) : all).map(row => row.id));
  const shown = (group: PlanGroup) => groups[group].filter(row => shownIds.has(row.id));
  // The Check-in's progress: rows planned (scheduled, dated away or left) since it opened.
  const [first] = useState(all.length);
  const planned = Math.max(first - all.length, 0);
  const toggle = <T,>(set: (update: (all: ReadonlySet<T>) => ReadonlySet<T>) => void, value: T) => set(current => { const next = new Set(current); if (!next.delete(value)) next.add(value); return next; });
  const projectItems = [{ value: ALL, label: "All projects" }, { value: INBOX, label: "Inbox" }, ...projects.map(project => ({ value: project.id, label: project.name }))];
  const close = ritual ? ritual.onClose : slots.onClose;
  return <RightSidebar className="ui w-plan! pr-3 data-[drop-target]:bg-selected [&>*]:shrink-0 max-md:fixed max-md:inset-0 max-md:z-20 max-md:w-full! max-md:bg-background" aria-label={ritual ? "Check-in" : "Plan"} data-plan=""
    data-ritual-panel={ritual ? "checkIn" : undefined}
    title={ritual ? "Check-in" : <>Plan <span className="font-normal text-muted-foreground">{all.length}</span></>}
    actions={<>
      {ritual && <Button type="button" variant="ghost" size="sm" disabled={ritual.pending} onClick={ritual.onSkip} data-ritual-action="skip">Skip</Button>}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={ritual ? "Close Check-in" : "Close Plan"} onClick={close}><X /></Button>
    </>}>
    {ritual && <div className="flex flex-col gap-2 pb-1" data-ritual-step="plan">
      <Progress aria-label={`${planned} of ${first} planned`} value={first ? Math.round(planned / first * 100) : 100} />
      <Hint>What should happen today? Drag tasks onto the calendar or schedule them from their row.</Hint>
      {ritual.status && <Hint className="text-xs">Already {ritual.status === "completed" ? "done" : "skipped"} today; Done again replaces it.</Hint>}
    </div>}
    {coach}
    <Select items={projectItems} value={projectId === undefined ? ALL : projectId === null ? INBOX : projectId}
      onValueChange={(next) => { if (next) onProject(next === ALL ? undefined : next === INBOX ? null : next as string); }}>
      <SelectTrigger size="sm" aria-label="Project" className="w-fit max-w-full shrink-0 gap-1.5" data-plan-filter="first"><Hash className="text-subtle-foreground" /><SelectValue /></SelectTrigger>
      <SelectContent>{projectItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
    {searchable && <div className="flex flex-col gap-2" data-plan-search="">
      <Input type="search" className="shrink-0" aria-label="Search tasks to plan" placeholder={`Search ${all.length} tasks`} value={text} onChange={event => setText(event.target.value)} />
      {planChips(all).length > 0 && <div className="flex flex-wrap gap-1" role="group" aria-label="Filter tasks to plan">{planChips(all).map(([chip, name]) =>
        <Toggle key={chip} variant="outline" size="sm" pressed={chips.has(chip)} onPressedChange={() => toggle(setChips, chip)} data-plan-chip={chip}>{name}</Toggle>)}
      </div>}
    </div>}
    <div className="flex flex-col gap-3 pt-1">
      {planGroupOrder.map(group => {
        const rows = shown(group);
        if (!rows.length) return null;
        const open = !closed.has(group);
        return <section key={group} aria-label={groupTitles[group]} data-plan-group={group}>
          <div className="flex h-control-sm items-center justify-between gap-2 border-b border-border">
            <button type="button" aria-expanded={open} onClick={() => toggle(setClosed, group)}
              className="-ml-1 flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ChevronDown aria-hidden="true" className={cn("size-4 text-subtle-foreground transition-transform", !open && "-rotate-90")} />
              {groupTitles[group]}<span className="font-normal text-muted-foreground">{rows.length}</span>
            </button>
            {group === "overdue" && <Button type="button" variant="link" size="xs" className="px-0 text-destructive" data-plan-action="reschedule"
              onClick={() => slots.onReschedule(rows.map(row => row.id))}>Reschedule</Button>}
          </div>
          {group === "now" && nowLoad && nowLoad.minutes > nowLoad.free && <Hint className="pt-1 text-xs text-attention" role="status" data-plan-now-warning="">
            Now has {hoursLabel(nowLoad.minutes)}; about {hoursLabel(nowLoad.free)} are free this week.</Hint>}
          {open && <List aria-label={groupTitles[group]}>{rows.map(row => <PlanRow key={row.id} row={row} slots={slots} checkIn={Boolean(ritual)}
            onLeave={() => setLeft(current => new Set(current).add(row.id))} />)}</List>}
        </section>;
      })}
      {!all.length ? <Hint className="py-2">Nothing to plan: no overdue, upcoming, Now, Next, Inbox or Later tasks without a time.</Hint>
        : !shownIds.size && <Hint className="py-2">No task matches the search or filters.</Hint>}
      <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start font-normal text-muted-foreground hover:text-brand" data-plan-action="add" onClick={slots.onAdd}>
        <Plus className="text-brand" />Add task</Button>
    </div>
    {ritual && <div className="sticky bottom-0 mt-auto flex justify-end border-t border-border-subtle bg-background py-2">
      <Button type="button" size="sm" disabled={ritual.pending} onClick={ritual.onDone} data-ritual-action="done">Done</Button>
    </div>}
  </RightSidebar>;
}
