// Upcoming and Today's calendar layouts (ticket 16). Both read the Today query:
// it is the full owned-task collection (getTasksForUser), exactly what the legacy
// Upcoming page loaded, so every task write already refreshes these views.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "./session";
import { projectReads, reads } from "./runtime";
import { useEditorExtras, useTaskWrites } from "./task-writes";
import { Composer, Failure, listTree, TaskEditor, TaskRow, type SelectionSlots } from "./views";
import { CalendarView, TodaySchedule, UpcomingList, useDisplay, type ScheduleSlots } from "./schedule-views";
import { dayKey, labels, startOfDay } from "./schedule";
import type { TaskDto } from "./tasks";
import { useCalendarEvents } from "./calendar-screens";
import { BoardScreen } from "./board-screens";
import { useBulkSelection } from "./bulk-screens";

/** Rows, edit dialog and slot composer shared by the schedule layouts. */
function useSchedule(account: Account, tasks: TaskDto[], { projectId = null, selection }: { projectId?: string | null; selection?: SelectionSlots } = {}) {
  const writes = useTaskWrites(account.user.id);
  const projects = useQuery(projectReads.list(account.user.id));
  const projectNames = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  const [editing, setEditing] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const now = new Date();
  // Indent a sub-task under its parent when both are listed on the same day.
  const day = (task: TaskDto) => task.dueDate ? dayKey(new Date(task.dueDate)) : "";
  const trees = new Map<string, ReturnType<typeof listTree>>();
  const treeOf = (task: TaskDto) => { const key = day(task); if (!trees.has(key)) trees.set(key, listTree(tasks.filter(item => day(item) === key))); return trees.get(key)!(task); };
  const slots: ScheduleSlots = {
    row: task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={writes.actions} selection={selection?.row(task)} {...treeOf(task)} />,
    open: task => setEditing(task.id),
    complete: writes.actions.complete,
    remove: writes.actions.remove,
    slot: (start, end) => setSlot({ start, end }),
  };
  // The editor follows the latest cached copy (a pristine form picks up other devices' edits).
  const task = editing ? tasks.find(item => item.id === editing) : undefined;
  const extras = useEditorExtras(account.user.id, task?.id ?? null);
  const overlay = <>
    {task && <TaskEditor key={task.id} task={task} labels={extras.labels} shareUrl={extras.shareUrl} onClose={() => setEditing(null)}
      onSave={async (details) => { await writes.update.mutateAsync({ id: task.id, details }); setEditing(null); }} />}
    {slot && <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSlot(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog">
        <Composer startOpen projectId={projectId} dueDate={() => slot.start.toISOString()} dueDateEnd={() => slot.end.toISOString()}
          destination={dayDestination(slot.start, now)}
          onCancel={() => setSlot(null)} onCreate={async (created) => { await writes.create.mutateAsync(created); setSlot(null); }} />
      </div>
    </div>}
  </>;
  return { writes, slots, overlay, now };
}

/** The week Calendar layout of a project or task collection (legacy ViewSwitcher default CalendarView); a slot adds a task to the project (else the Inbox). */
export function ProjectCalendar({ account, tasks, projectId }: { account: Account; tasks: TaskDto[]; projectId?: string }) {
  const { slots, overlay, writes, now } = useSchedule(account, tasks, { projectId });
  const events = useCalendarEvents(account.user.id);
  return <>{writes.error && <p role="alert" className="form-error">{writes.error}</p>}<CalendarView tasks={tasks} events={events} slots={slots} now={now} />{overlay}</>;
}

/** Today's Calendar layout: the legacy daily schedule. */
export function TodayCalendar({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const { slots, overlay, writes, now } = useSchedule(account, tasks);
  const events = useCalendarEvents(account.user.id);
  return <>{writes.error && <p role="alert" className="form-error">{writes.error}</p>}<TodaySchedule tasks={tasks} events={events} slots={slots} now={now} />{overlay}</>;
}

export function UpcomingScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  const { layout } = useDisplay();
  const events = useCalendarEvents(account.user.id);
  const tasks = query.data?.tasks ?? [];
  // Ticket 15 selection on the list layout (legacy TaskKeyboardProvider wrapped Upcoming too).
  const selection = useBulkSelection(account.user.id, tasks);
  const { slots, overlay, writes, now } = useSchedule(account, tasks, { selection: layout === "list" ? selection : undefined });
  const composer = (day: Date): ReactNode => <Composer dueDate={() => startOfDay(day).toISOString()} destination={dayDestination(day, now)}
    onCreate={(task) => writes.create.mutateAsync(task)} />;
  let body: ReactNode;
  if (query.status === "pending") body = <p className="state" role="status">Loading tasks…</p>;
  else if (!query.data) body = <Failure error={query.error} onRetry={() => void query.refetch()} />;
  else body = <>
    {query.status === "error" && <Failure error={query.error} onRetry={() => void query.refetch()} />}
    {writes.error && <p role="alert" className="form-error">{writes.error}</p>}
    {layout === "board" ? <BoardScreen account={account} tasks={tasks} />
      : layout === "calendar" ? <CalendarView tasks={tasks} events={events} slots={slots} now={now} />
      : <>{selection.toolbar}<UpcomingList tasks={tasks} events={events} slots={slots} composer={composer} now={now} /></>}
  </>;
  return <div><div className="project-header"><h1 className="page-title upcoming-title">Upcoming</h1>{layout === "list" && query.data && selection.control}</div>{body}{overlay}</div>;
}

/** Legacy composer date chip: Today, Tomorrow or "d MMM". */
export function dayDestination(day: Date, now = new Date()) {
  const label = labels.day(day, now).split(" · ");
  return label.length === 3 ? label[1] : label[0];
}
