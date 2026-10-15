import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { CalendarClock, ChevronDown, Hash, Inbox, Plus, X } from "lucide-react";
import { deadlineLabel, dueLabel, isOverdue, operationId, todayHeading, todaySections, type NewTask, type TaskDto, type TodayDto } from "./tasks";

// Pure screen views: no runtime/transport imports, so they render in tests.
export type ReadState<T> = { status: "pending" | "error" | "success"; data?: T; error: Error | null };

export function Failure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return <div className="state"><p role="alert">{error?.message ?? "Your tasks could not be loaded. Try again."}</p><button type="button" className="text-action" onClick={onRetry}>Try again</button></div>;
}

/** Row writes; without them a row keeps the inert legacy checkbox. */
export interface RowActions { complete(task: TaskDto): void; remove(task: TaskDto): void }

export function TaskRow({ task, now, projectName, actions }: { task: TaskDto; now: Date; projectName?: string; actions?: RowActions }) {
  return <div className={task.parentId ? "task-row child" : "task-row"}>
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

/**
 * Basic task composer (ticket 5; smart dates and rich fields are tickets 11/12).
 * Input is kept until the server confirms. The operation ID is reused while
 * the draft is unchanged, so resubmitting after an unclear failure cannot
 * create a second copy of a task that was in fact saved.
 */
export function Composer({ dueDate, onCreate, onCancel, startOpen = false }: {
  /** Due date for the new task at submit time; null files it in the Inbox. */
  dueDate: () => string | null;
  onCreate: (task: NewTask) => Promise<unknown>;
  onCancel?: () => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const destination = dueDate() ? "Today" : "Inbox";
  const close = () => { setOpen(false); setTitle(""); setDescription(""); setError(null); operation.current = null; onCancel?.(); };
  if (!open) return <button type="button" className="composer" onClick={() => setOpen(true)}><Plus />Add task</button>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name || pending) return;
    const task = { title: name, ...(description.trim() && { description: description.trim() }), dueDate: dueDate() };
    const key = JSON.stringify(task);
    if (operation.current?.key !== key) operation.current = { key, id: operationId() };
    setPending(true); setError(null);
    try {
      await onCreate({ id: operation.current.id, ...task });
      setTitle(""); setDescription(""); operation.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again.");
    } finally { setPending(false); }
  }
  return <form className="composer-form" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
    {error && <p role="alert" className="form-error">{error}</p>}
    <input autoFocus aria-label="Task name" placeholder="Task name" enterKeyHint="done" value={title} onChange={(event) => setTitle(event.target.value)} />
    <input aria-label="Description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
    <div className="composer-footer">
      <span className="pill project">{destination === "Today" ? <CalendarClock /> : <Inbox />}{destination}</span>
      <div className="composer-actions">
        <button type="button" className="button outline" onClick={close}>Cancel</button>
        <button type="submit" className="button" disabled={!title.trim() || pending}>{pending ? "Adding…" : "Add task"}</button>
      </div>
    </div>
  </form>;
}

export function TodayView({ state, onRetry, now = new Date(), projectNames = {}, actions, composer, writeError }: {
  state: ReadState<TodayDto>; onRetry: () => void; now?: Date; projectNames?: Record<string, string>;
  actions?: RowActions; composer?: ReactNode; writeError?: string | null;
}) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const header = <><h1 className="page-title">Today</h1><p className="page-count">{state.data ? `${state.data.openCount} tasks` : " "}</p></>;
  if (state.status === "pending") return <div>{header}<p className="state" role="status">Loading tasks…</p></div>;
  if (!state.data) return <div>{header}<Failure error={state.error} onRetry={onRetry} /></div>;
  const { overdue, today } = todaySections(state.data.tasks, now);
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

export function TaskView({ state, onRetry, actions, writeError }: { state: ReadState<TaskDto | null>; onRetry: () => void; actions?: RowActions; writeError?: string | null }) {
  let body: ReactNode;
  if (state.status === "pending") body = <p className="state" role="status">Loading task…</p>;
  else if (state.status === "error") body = <Failure error={state.error} onRetry={onRetry} />;
  else if (!state.data) body = <><h1 className="page-title">Task not found</h1><p className="state">This task does not exist or you do not have access to it.</p></>;
  else {
    const task = state.data;
    const meta = [`Priority ${task.priority}`, task.dueDate && `Due ${dueLabel(task.dueDate)}`, task.deadline && `Deadline ${deadlineLabel(task.deadline)}`].filter(Boolean).join(" · ");
    body = <>
      <h1 className="page-title">{task.title}</h1>
      {task.status === "done" && <p>Completed task</p>}
      {task.description && <p className="description">{task.description}</p>}
      <p>{meta}</p>
      {writeError && <p role="alert" className="form-error">{writeError}</p>}
      {actions && <div className="task-actions">
        {task.status !== "done" && <button type="button" className="button outline" onClick={() => actions.complete(task)}>Complete task</button>}
        <button type="button" className="button destructive" onClick={() => actions.remove(task)}>Delete task</button>
      </div>}
    </>;
  }
  return <article className="task-detail">{body}<Link className="text-action" to="/today">Back to Today</Link></article>;
}
