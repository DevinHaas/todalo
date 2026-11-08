import { createContext, useContext, useEffect, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { CalendarDays, ChevronDown, ChevronRight, Flag, FlagTriangleRight, GitBranch, Goal, Hash, Inbox, MessageSquare, Plus, Repeat, Tag, X } from "lucide-react";
import {
  dateInputValue, deadlineLabel, dueLabel, isDueToday, isOverdue, localInstant, repeatChoice, repeatLabel, repeatPresets, shortDateLabel, timeInputValue,
  todayHeading, todaySections, treeDepths, type RecurrenceDto, type RepeatChoice, type TaskDetails, type TaskDto, type TodayDto,
} from "./tasks";
import { AccountTransportError } from "./errors";
import { releaseFocus } from "./software-keyboard";
import { eventDayKey, type CalendarEventDto } from "./calendar";
import { EventRow } from "./calendar-views";
import { dayKey } from "./schedule";
import { goalColorValue } from "./goals";
import { copyText, taskPath } from "./links";
import { Dropdown, type Option } from "./popover";
import { ComposerChoices } from "./composer";
import { MilestoneTasks, TaskGoals, TaskTree, subtasksOf } from "./task-tree";
import { GoalIcon } from "./goal-views";

// Pure screen views: no runtime/transport imports, so they render in tests.
export type ReadState<T> = { status: "pending" | "error" | "success"; data?: T; error: Error | null };

export function Failure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return <div className="state"><p role="alert">{error?.message ?? "Your tasks could not be loaded. Try again."}</p><button type="button" className="text-action" onClick={onRetry}>Try again</button></div>;
}

/** Row writes; without them a row keeps the inert legacy checkbox. */
export interface RowActions { complete(task: TaskDto): void; remove(task: TaskDto): void }

/** Ticket 15: one row's place in a selection (bulk-views `Selection`). */
export interface RowSelection { selected: boolean; toggle(): void }
/** Ticket 15 slots: the header's Select button, the selection toolbar, and each row's checkbox. */
export interface SelectionSlots { control: ReactNode; toolbar: ReactNode; row(task: TaskDto): RowSelection | undefined }

/**
 * Legacy collapsedIds: parents whose sub-tasks are hidden (Shift+E, toggle
 * nested). Page state, cleared on navigation (keyboard-screens.tsx).
 */
let collapsed: ReadonlySet<string> = new Set();
const collapseListeners = new Set<() => void>();
export const collapsedTasks = {
  get: () => collapsed,
  subscribe(listener: () => void) { collapseListeners.add(listener); return () => { collapseListeners.delete(listener); }; },
  set(next: ReadonlySet<string>) { collapsed = next; collapseListeners.forEach(listener => listener()); },
  toggle(id: string) { const next = new Set(collapsed); if (!next.delete(id)) next.add(id); collapsedTasks.set(next); },
};

/**
 * The edit dialog over the list (legacy TaskKeyboardProvider, shell.tsx): a
 * title tap opens it without leaving the page, and `slot` places Save and
 * add's composer above or below its row. Without it a title is a plain link.
 */
export interface TaskDialog {
  open(id: string): void;
  slot(id: string, edge: "above" | "below"): ReactNode;
  /** ⌘E: edit the task in place with the quick add editor; `editor` is that editor while it is open (else null). */
  edit?(id: string): void;
  editor?(task: TaskDto): ReactNode;
}
export const TaskDialogs = createContext<TaskDialog | null>(null);

export { TaskTree, subtasksOf } from "./task-tree";

/** A list's rows with their indent (`depth`) and whether their sub-tasks are rows of the same list (`nested`). */
export function listTree(tasks: readonly TaskDto[]) {
  const depths = treeDepths(tasks);
  const parents = new Set(tasks.map(task => task.parentId));
  return (task: TaskDto) => ({ depth: depths.get(task.id) ?? 0, nested: parents.has(task.id) });
}

/** Hidden while any ancestor is collapsed (Shift+E, the row chevron). */
function hiddenBy(task: TaskDto, tasks: readonly TaskDto[] | null, closed: ReadonlySet<string>) {
  const byId = new Map((tasks ?? []).map(item => [item.id, item]));
  for (let parent = task.parentId, guard = 0; parent && guard < 10; parent = byId.get(parent)?.parentId ?? null, guard++) if (closed.has(parent)) return true;
  return false;
}

export function TaskRow({ task, now, projectName, actions, selection, depth = 0, nested = false, inToday = false }: {
  task: TaskDto; now: Date; projectName?: string; actions?: RowActions; selection?: RowSelection;
  /** Indent level in its list (listTree). */
  depth?: number;
  /** Its sub-tasks are rows of the same list: the chevron collapses them instead of expanding them inline. */
  nested?: boolean;
  /** On the Today page an all-day today date is implied and not shown. */
  inToday?: boolean;
}) {
  const tree = useContext(TaskTree);
  const milestone = useContext(MilestoneTasks).has(task.id);
  // Ticket 14c: a goal task's circle is in its goal's colour, with the goal's icon in the meta line.
  const goal = useContext(TaskGoals)(task);
  const ring = goal ? { "--ring-color": goalColorValue(goal.color) } as CSSProperties : undefined;
  const closed = useSyncExternalStore(collapsedTasks.subscribe, collapsedTasks.get, collapsedTasks.get);
  const hidden = hiddenBy(task, tree, closed);
  const [expanded, setExpanded] = useState(false);
  const dialog = useContext(TaskDialogs);
  const { labels } = useContext(ComposerChoices);
  const subtasks = subtasksOf(task.id, tree);
  const open = dialog ? (event: MouseEvent) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.open(task.id);
  } : undefined;
  const showing = nested ? !closed.has(task.id) : expanded;
  const date = shortDateLabel(task, now, inToday);
  const labelNames = task.labelIds.map(id => labels?.find(label => label.id === id)?.name).filter(Boolean);
  const editor = dialog?.editor?.(task);
  if (editor && !hidden) return <>{editor}</>;
  return <>{dialog?.slot(task.id, "above")}<div className={task.parentId ? "task-row child" : "task-row"} data-task-id={task.id} data-parent-id={task.parentId ?? undefined} hidden={hidden}
    data-depth={depth || undefined} style={depth ? { "--depth": depth } as CSSProperties : undefined}
    data-done={task.status === "done" || undefined} data-selected={selection?.selected || undefined}>
    {selection && <input type="checkbox" className="select-box" aria-label={`Select ${task.title}`} checked={selection.selected} onChange={selection.toggle} />}
    {actions
      ? <button type="button" role="checkbox" aria-checked={task.status === "done"} aria-label={`Complete ${task.title}`} className="checkbox" data-priority={task.priority} style={ring} onClick={() => actions.complete(task)} />
      : <span className="checkbox" data-priority={task.priority} style={ring} aria-hidden="true" />}
    <div className="row-body">
      <Link to={taskPath(task.id)} className="task-title" onClick={open}>{task.title}{milestone && <MilestoneMark />}</Link>
      {dialog?.edit && <button type="button" hidden data-edit onClick={() => dialog.edit!(task.id)}>Edit {task.title}</button>}
      <div className="row-meta">
        {date && <span className={isOverdue(task, now) ? "pill due overdue" : isDueToday(task, now) ? "pill due today" : "pill due"}><CalendarDays />{date}</span>}
        {task.recurrence && <span className="pill" aria-label={repeatLabel(task.recurrence)}><Repeat /></span>}
        {task.priority < 4 && <span className="pill priority" aria-label={`Priority ${task.priority}`}><Flag data-priority={task.priority} />P{task.priority}</span>}
        {task.deadline && <span className="pill"><Goal />Deadline {deadlineLabel(task.deadline)}</span>}
        {task.labelIds.length > 0 && <span className="pill"><Tag />{labelNames.length === task.labelIds.length ? labelNames.join(", ") : `${task.labelIds.length} label${task.labelIds.length > 1 ? "s" : ""}`}</span>}
        {subtasks.total > 0 && <button type="button" className="pill subtasks" aria-expanded={showing}
          aria-label={`Sub-tasks ${subtasks.done.length} of ${subtasks.total} done, ${showing ? "hide" : "show"}`}
          onClick={() => nested ? collapsedTasks.toggle(task.id) : setExpanded(value => !value)}>
          <GitBranch />{subtasks.done.length}/{subtasks.total}<ChevronRight className="chevron" />
        </button>}
        {goal && <span className="pill" title={goal.title}><GoalIcon color={goal.color} icon={goal.icon} size="xs" /><span className="sr-only">Goal {goal.title}</span></span>}
        {(task.commentCount ?? 0) > 0 && <span className="pill comments" aria-label={`${task.commentCount} comment${task.commentCount! > 1 ? "s" : ""}`}><MessageSquare />{task.commentCount}</span>}
        <span className="pill project">{projectName ?? "Inbox"}{projectName ? <Hash /> : <Inbox />}</span>
      </div>
    </div>
    {actions && <button type="button" className="icon-button row-delete" aria-label={`Delete ${task.title}`} onClick={() => actions.remove(task)}><X /></button>}
  </div>
  {!nested && expanded && !hidden && subtasks.open.map(child => <TaskRow key={child.id} task={child} now={now} projectName={projectName} actions={actions} depth={depth + 1} inToday={inToday} />)}
  {dialog?.slot(task.id, "below")}</>;
}

/** The small flag after a milestone's title (task rows, board cards, the goal page). */
export const MilestoneMark = () => <span className="milestone-mark" title="Milestone"><FlagTriangleRight aria-hidden="true" /><span className="sr-only">Milestone</span></span>;

// The task composer with smart quick add (tickets 5, 12) lives in composer.tsx.
export { Composer } from "./composer";

export function TodayView({ state, onRetry, now = new Date(), projectNames = {}, actions, composer, showCompleted = false, calendar, events = [], selection }: {
  state: ReadState<TodayDto>; onRetry: () => void; now?: Date; projectNames?: Record<string, string>;
  actions?: RowActions; composer?: ReactNode;
  /** Display settings (ticket 16): completed tasks, and the Calendar layout in place of the list. */
  showCompleted?: boolean; calendar?: (tasks: TaskDto[]) => ReactNode;
  /** Ticket 20: provider events; today's render first in the Today section (legacy TodayView). */
  events?: CalendarEventDto[];
  /** Ticket 15: Select button, toolbar and row checkboxes (list layout only). */
  selection?: SelectionSlots;
}) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const header = <><div className="project-header"><h1 className="page-title">Today</h1>{!calendar && state.data && selection?.control}</div><p className="page-count">{state.data ? `${state.data.openCount} tasks` : " "}</p></>;
  if (state.status === "pending") return <div>{header}<p className="state" role="status">Loading tasks…</p></div>;
  if (!state.data) return <div>{header}<Failure error={state.error} onRetry={onRetry} /></div>;
  if (calendar) return <div>{header}{state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}{calendar(state.data.tasks)}</div>;
  const { overdue, today } = todaySections(state.data.tasks, now, showCompleted);
  const tree = listTree([...overdue, ...today]);
  const todayEvents = events.filter(event => eventDayKey(event) === dayKey(now));
  // A failed refetch keeps the last list (and an open composer's draft) on screen.
  return <div>{header}{state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}{selection?.toolbar}<div className="sections">
    {overdue.length > 0 && <section>
      <button type="button" className="section-toggle" aria-expanded={overdueOpen} onClick={() => setOverdueOpen(open => !open)}>
        <ChevronDown className={overdueOpen ? "" : "closed"} />Overdue<span className="muted-count">{overdue.length}</span>
      </button>
      {overdueOpen && overdue.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} selection={selection?.row(task)} {...tree(task)} />)}
    </section>}
    <section>
      <h2 className="section-heading">{todayHeading(now)}</h2>
      {todayEvents.map(event => <EventRow key={event.id} event={event} />)}
      {today.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} selection={selection?.row(task)} inToday {...tree(task)} />)}
      {today.length === 0 && overdue.length === 0 && todayEvents.length === 0 && <p className="state">Nothing is due today.</p>}
      {composer ?? <span className="composer" aria-disabled="true"><Plus />Add task</span>}
    </section>
  </div></div>;
}

export function TaskView({ state, onRetry, actions, attachments, onEdit, editor, organize }: {
  state: ReadState<TaskDto | null>; onRetry: () => void; actions?: RowActions; attachments?: ReactNode;
  /** Opens the edit dialog (rendered as `editor`); without it the page stays read-only. */
  onEdit?: () => void; editor?: ReactNode;
  /** Ticket 13: Move / Nest / Unnest for the loaded task. */
  organize?: (task: TaskDto) => ReactNode;
}) {
  let body: ReactNode;
  if (state.status === "pending") body = <p className="state" role="status">Loading task…</p>;
  else if (state.status === "error") body = <Failure error={state.error} onRetry={onRetry} />;
  else if (!state.data) body = <><h1 className="page-title">Task not found</h1><p className="state">This task does not exist or you do not have access to it.</p></>;
  else {
    const task = state.data;
    const meta = [`Priority ${task.priority}`, task.dueDate && `Due ${dueLabel(task.dueDate)}`, task.recurrence && repeatLabel(task.recurrence), task.deadline && `Deadline ${deadlineLabel(task.deadline)}`].filter(Boolean).join(" · ");
    body = <>
      <h1 className="page-title">{task.title}</h1>
      {task.status === "done" && <p>Completed task</p>}
      {task.description && <p className="description">{task.description}</p>}
      <p>{meta}</p>
      {attachments}
      {(actions || onEdit) && <div className="task-actions">
        {onEdit && <button type="button" className="button" onClick={onEdit}>Edit task details</button>}
        {actions && task.status !== "done" && <button type="button" className="button outline" onClick={() => actions.complete(task)}>Complete task</button>}
        {actions && <button type="button" className="button destructive" onClick={() => actions.remove(task)}>Delete task</button>}
      </div>}
      {organize?.(task)}
      {editor}
    </>;
  }
  // Legacy "Open task collection": the task's project, else the Inbox.
  const collection = state.data ? state.data.projectId ? `/projects/${encodeURIComponent(state.data.projectId)}` : "/inbox" : null;
  return <article className="task-detail">{body}{collection && <Link className="text-action" to={collection}>Open task collection</Link>}<Link className="text-action" to="/today">Back to Today</Link></article>;
}

// The task sheet (detail and edit dialog) lives in task-sheet.tsx.
export { TaskEditor } from "./task-sheet";
