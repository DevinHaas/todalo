import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronDown, Hash, Inbox, Plus, X } from "lucide-react";
import {
  dateInputValue, deadlineLabel, dueLabel, isOverdue, localInstant, repeatChoice, repeatLabel, repeatPresets, timeInputValue,
  todayHeading, todaySections, type RecurrenceDto, type RepeatChoice, type TaskDetails, type TaskDto, type TodayDto,
} from "./tasks";
import { AccountTransportError } from "./errors";
import { releaseFocus } from "./software-keyboard";
import { copyText, taskPath } from "./links";

// Pure screen views: no runtime/transport imports, so they render in tests.
export type ReadState<T> = { status: "pending" | "error" | "success"; data?: T; error: Error | null };

export function Failure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return <div className="state"><p role="alert">{error?.message ?? "Your tasks could not be loaded. Try again."}</p><button type="button" className="text-action" onClick={onRetry}>Try again</button></div>;
}

/** Row writes; without them a row keeps the inert legacy checkbox. */
export interface RowActions { complete(task: TaskDto): void; remove(task: TaskDto): void }

export function TaskRow({ task, now, projectName, actions }: { task: TaskDto; now: Date; projectName?: string; actions?: RowActions }) {
  return <div className={task.parentId ? "task-row child" : "task-row"} data-done={task.status === "done" || undefined}>
    {actions
      ? <button type="button" role="checkbox" aria-checked={task.status === "done"} aria-label={`Complete ${task.title}`} className="checkbox" onClick={() => actions.complete(task)} />
      : <span className="checkbox" aria-hidden="true" />}
    <Link to={`/tasks/${encodeURIComponent(task.id)}`} className="task-title">{task.title}</Link>
    {task.dueDate && <span className={isOverdue(task, now) ? "pill overdue" : "pill"}>{dueLabel(task.dueDate)}</span>}
    {task.priority < 4 && <span className="pill priority" aria-label={`Priority ${task.priority}`}>P{task.priority}</span>}
    {task.deadline && <span className="pill">Deadline {deadlineLabel(task.deadline)}</span>}
    {task.labelIds.length > 0 && <span className="pill">{task.labelIds.length} label{task.labelIds.length > 1 ? "s" : ""}</span>}
    <span className="pill project">{projectName ? <Hash /> : <Inbox />}{projectName ?? "Inbox"}</span>
    {actions && <button type="button" className="icon-button row-delete" aria-label={`Delete ${task.title}`} onClick={() => actions.remove(task)}><X /></button>}
  </div>;
}

// The task composer with smart quick add (tickets 5, 12) lives in composer.tsx.
export { Composer } from "./composer";

export function TodayView({ state, onRetry, now = new Date(), projectNames = {}, actions, composer, writeError, showCompleted = false, calendar }: {
  state: ReadState<TodayDto>; onRetry: () => void; now?: Date; projectNames?: Record<string, string>;
  actions?: RowActions; composer?: ReactNode; writeError?: string | null;
  /** Display settings (ticket 16): completed tasks, and the Calendar layout in place of the list. */
  showCompleted?: boolean; calendar?: (tasks: TaskDto[]) => ReactNode;
}) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const header = <><h1 className="page-title">Today</h1><p className="page-count">{state.data ? `${state.data.openCount} tasks` : " "}</p></>;
  if (state.status === "pending") return <div>{header}<p className="state" role="status">Loading tasks…</p></div>;
  if (!state.data) return <div>{header}<Failure error={state.error} onRetry={onRetry} /></div>;
  if (calendar) return <div>{header}{state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}{calendar(state.data.tasks)}</div>;
  const { overdue, today } = todaySections(state.data.tasks, now, showCompleted);
  // A failed refetch keeps the last list (and an open composer's draft) on screen.
  return <div>{header}{state.status === "error" && <Failure error={state.error} onRetry={onRetry} />}{writeError && <p role="alert" className="form-error">{writeError}</p>}<div className="sections">
    {overdue.length > 0 && <section>
      <button type="button" className="section-toggle" aria-expanded={overdueOpen} onClick={() => setOverdueOpen(open => !open)}>
        <ChevronDown className={overdueOpen ? "" : "closed"} />Overdue<span className="muted-count">{overdue.length}</span>
      </button>
      {overdueOpen && overdue.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} />)}
    </section>}
    <section>
      <h2 className="section-heading">{todayHeading(now)}</h2>
      {today.map(task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={actions} />)}
      {today.length === 0 && overdue.length === 0 && <p className="state">Nothing is due today.</p>}
      {composer ?? <span className="composer" aria-disabled="true"><Plus />Add task</span>}
    </section>
  </div></div>;
}

export function TaskView({ state, onRetry, actions, writeError, attachments, onEdit, editor, organize }: {
  state: ReadState<TaskDto | null>; onRetry: () => void; actions?: RowActions; writeError?: string | null; attachments?: ReactNode;
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
      {writeError && <p role="alert" className="form-error">{writeError}</p>}
      {(actions || onEdit) && <div className="task-actions">
        {onEdit && <button type="button" className="button" onClick={onEdit}>Edit task details</button>}
        {actions && task.status !== "done" && <button type="button" className="button outline" onClick={() => actions.complete(task)}>Complete task</button>}
        {actions && <button type="button" className="button destructive" onClick={() => actions.remove(task)}>Delete task</button>}
      </div>}
      {organize?.(task)}
      {editor}
    </>;
  }
  return <article className="task-detail">{body}<Link className="text-action" to="/today">Back to Today</Link></article>;
}

type Draft = { title: string; description: string; priority: number; deadline: string; date: string; start: string; end: string; recurrence: RecurrenceDto | null; labelIds: string[] };
const draftOf = (task: TaskDto): Draft => ({
  title: task.title, description: task.description ?? "", priority: task.priority, deadline: dateInputValue(task.deadline),
  date: dateInputValue(task.dueDate), start: timeInputValue(task.dueDate), end: timeInputValue(task.dueDateEnd, false), recurrence: task.recurrence,
  labelIds: task.labelIds,
});
const repeatNames: Record<Exclude<RepeatChoice, "custom">, string> = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

/**
 * The legacy task edit dialog (ticket 11, labels ticket 14). It saves every
 * field with the version it was opened from. A pristine form follows newer
 * copies of the task; a draft is never replaced silently — if another device
 * changed the task, saving fails with TASK_CHANGED and the user loads the
 * current details. A custom repeat (from quick add) is kept unless replaced.
 * With `labels` (the user's list) it shows the label checkboxes and sends the
 * checked set, limited to labels that still exist; without it labels are kept.
 */
export function TaskEditor({ task, labels, shareUrl, onSave, onClose }: {
  task: TaskDto; labels?: { id: string; name: string }[];
  /** The resolved https task link (ticket 18); the legacy "Task link · Copy link" row shows once known. */
  shareUrl?: string;
  onSave: (details: TaskDetails) => Promise<unknown>; onClose: () => void;
}) {
  const [base, setBase] = useState(task);
  const [draft, setDraft] = useState(() => draftOf(task));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState(false);
  const load = (copy: TaskDto) => { setBase(copy); setDraft(draftOf(copy)); setDirty(false); setError(null); };
  useEffect(() => { if (!dirty && task.updatedAt !== base.updatedAt) load(task); }, [task, dirty, base.updatedAt]);
  const edit = (change: Partial<Draft>) => { setDraft(current => ({ ...current, ...change })); setDirty(true); };
  const changed = error instanceof AccountTransportError && error.code === "TASK_CHANGED";
  const choice = repeatChoice(draft.recurrence);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || pending) return;
    setPending(true); setError(null);
    try {
      await onSave({
        updatedAt: base.updatedAt ?? "", title: draft.title.trim(), description: draft.description, priority: draft.priority,
        deadline: draft.deadline ? localInstant(draft.deadline) : null,
        dueDate: draft.date ? localInstant(draft.date, draft.start) : null,
        dueDateEnd: draft.date && draft.end ? localInstant(draft.date, draft.end) : null,
        recurrence: draft.recurrence,
        ...(labels && { labelIds: draft.labelIds.filter(id => labels.some(label => label.id === id)) }),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Your changes could not be saved. Try again."));
    } finally { setPending(false); }
  }

  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="dialog task-editor">
      <h2 id="task-editor-title" className="dialog-title">{base.title}</h2>
      <form ref={releaseFocus} onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape" && !pending) onClose(); }}>
        {error && <p role="alert" className="form-error">{error.message}{changed && <> <button type="button" className="text-action" disabled={task.updatedAt === base.updatedAt} onClick={() => load(task)}>{task.updatedAt === base.updatedAt ? "Loading current details…" : "Load current details"}</button></>}</p>}
        <fieldset disabled={pending}>
          <label>Task name<input autoFocus value={draft.title} enterKeyHint="done" onChange={(event) => edit({ title: event.target.value })} /></label>
          <label>Description<textarea value={draft.description} rows={3} onChange={(event) => edit({ description: event.target.value })} /></label>
          <label>Priority<select value={draft.priority} onChange={(event) => edit({ priority: Number(event.target.value) })}>
            {[1, 2, 3, 4].map(value => <option key={value} value={value}>Priority {value}{value === 1 ? " — highest" : value === 4 ? " — normal" : ""}</option>)}
          </select></label>
          <div className="field-row">
            <label>Deadline<input type="date" value={draft.deadline} onChange={(event) => edit({ deadline: event.target.value })} /></label>
            <button type="button" className="text-action" disabled={!draft.deadline} onClick={() => edit({ deadline: "" })}>Clear deadline</button>
          </div>
          {labels && <fieldset className="label-choices"><legend>Labels</legend>
            {labels.length > 0 && <div className="label-options">{labels.map(label => <label key={label.id} className="label-option">
              <input type="checkbox" checked={draft.labelIds.includes(label.id)} onChange={(event) => edit({ labelIds: event.target.checked ? [...draft.labelIds, label.id] : draft.labelIds.filter(id => id !== label.id) })} />{label.name}
            </label>)}</div>}
            {!labels.length && <p className="state">Create labels in <Link to="/labels" onClick={onClose}>Labels</Link>.</p>}
          </fieldset>}
          {shareUrl && <div className="task-links">
            <Link to={taskPath(base.id)} className="text-action" onClick={onClose}>Task link</Link>
            <button type="button" className="text-action" onClick={() => copyText(shareUrl).then(() => setCopied(true), (reason: Error) => setError(reason))}>Copy link</button>
            {copied && <span role="status">Task link copied.</span>}
          </div>}
          <div className="field-row">
            <label>Due date<input type="date" value={draft.date} onChange={(event) => edit({ date: event.target.value })} /></label>
            <button type="button" className="text-action" disabled={!draft.date} onClick={() => edit({ date: "", start: "", end: "" })}>Clear date</button>
          </div>
          {/* Shown once a date is set; leaving both empty keeps the task all-day. */}
          {draft.date && <div className="time-range">
            <input type="time" aria-label="Start time" value={draft.start} onChange={(event) => edit({ start: event.target.value })} />
            <span>to</span>
            <input type="time" aria-label="End time" value={draft.end} onChange={(event) => edit({ end: event.target.value })} />
          </div>}
          <label>Repeat<select value={choice} onChange={(event) => {
            const value = event.target.value as RepeatChoice;
            if (value !== "custom") edit({ recurrence: value === "none" ? null : repeatPresets[value] });
          }}>
            {(Object.keys(repeatNames) as (keyof typeof repeatNames)[]).map(value => <option key={value} value={value}>{repeatNames[value]}</option>)}
            {choice === "custom" && draft.recurrence && <option value="custom">{repeatLabel(draft.recurrence)}</option>}
          </select></label>
        </fieldset>
        <div className="composer-actions">
          <button type="button" className="button outline" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" className="button" disabled={pending || !draft.title.trim()}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  </div>;
}
