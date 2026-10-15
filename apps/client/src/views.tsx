import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronDown, Inbox, Plus } from "lucide-react";
import { deadlineLabel, dueLabel, isOverdue, todayHeading, todaySections, type TaskDto, type TodayDto } from "./tasks";

// Pure screen views: no runtime/transport imports, so they render in tests.
type ReadState<T> = { status: "pending" | "error" | "success"; data?: T; error: Error | null };

function Failure({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return <div className="state"><p role="alert">{error?.message ?? "Your tasks could not be loaded. Try again."}</p><button type="button" className="text-action" onClick={onRetry}>Try again</button></div>;
}

function TaskRow({ task, now }: { task: TaskDto; now: Date }) {
  return <div className={task.parentId ? "task-row child" : "task-row"}>
    <span className="checkbox" aria-hidden="true" />
    <Link to={`/tasks/${encodeURIComponent(task.id)}`} className="task-title">{task.title}</Link>
    {task.dueDate && <span className={isOverdue(task, now) ? "pill overdue" : "pill"}>{dueLabel(task.dueDate)}</span>}
    {task.priority < 4 && <span className="pill priority" aria-label={`Priority ${task.priority}`}>P{task.priority}</span>}
    {task.deadline && <span className="pill">Deadline {deadlineLabel(task.deadline)}</span>}
    {task.labelIds.length > 0 && <span className="pill">{task.labelIds.length} label{task.labelIds.length > 1 ? "s" : ""}</span>}
    <span className="pill project"><Inbox />Inbox</span>
  </div>;
}

export function TodayView({ state, onRetry, now = new Date() }: { state: ReadState<TodayDto>; onRetry: () => void; now?: Date }) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const header = <><h1 className="page-title">Today</h1><p className="page-count">{state.data ? `${state.data.openCount} tasks` : " "}</p></>;
  if (state.status === "pending") return <div>{header}<p className="state" role="status">Loading tasks…</p></div>;
  if (state.status === "error" || !state.data) return <div>{header}<Failure error={state.error} onRetry={onRetry} /></div>;
  const { overdue, today } = todaySections(state.data.tasks, now);
  return <div>{header}<div className="sections">
    {overdue.length > 0 && <section>
      <button type="button" className="section-toggle" aria-expanded={overdueOpen} onClick={() => setOverdueOpen(open => !open)}>
        <ChevronDown className={overdueOpen ? "" : "closed"} />Overdue<span className="muted-count">{overdue.length}</span>
      </button>
      {overdueOpen && overdue.map(task => <TaskRow key={task.id} task={task} now={now} />)}
    </section>}
    <section>
      <h2 className="section-heading">{todayHeading(now)}</h2>
      {today.map(task => <TaskRow key={task.id} task={task} now={now} />)}
      {today.length === 0 && overdue.length === 0 && <p className="state">Nothing is due today.</p>}
      <span className="composer" aria-disabled="true"><Plus />Add task</span>
    </section>
  </div></div>;
}

export function TaskView({ state, onRetry }: { state: ReadState<TaskDto | null>; onRetry: () => void }) {
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
    </>;
  }
  return <article className="task-detail">{body}<Link className="text-action" to="/today">Back to Today</Link></article>;
}
