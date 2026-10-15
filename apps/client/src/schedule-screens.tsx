// Upcoming and Today's calendar layouts (ticket 16). Both read the Today query:
// it is the full owned-task collection (getTasksForUser), exactly what the legacy
// Upcoming page loaded, so every task write already refreshes these views.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "./session";
import { projectReads, reads } from "./runtime";
import { useTaskWrites } from "./task-writes";
import { Composer, Failure, TaskEditor, TaskRow } from "./views";
import { CalendarView, TodaySchedule, UpcomingList, useDisplay, type ScheduleSlots } from "./schedule-views";
import { labels, startOfDay } from "./schedule";
import type { TaskDto } from "./tasks";
import { useCalendarEvents } from "./calendar-screens";

/** Rows, edit dialog and slot composer shared by the schedule layouts. */
function useSchedule(account: Account, tasks: TaskDto[]) {
  const writes = useTaskWrites(account.user.id);
  const projects = useQuery(projectReads.list(account.user.id));
  const projectNames = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  const [editing, setEditing] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const now = new Date();
  const slots: ScheduleSlots = {
    row: task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={writes.actions} />,
    open: task => setEditing(task.id),
    complete: writes.actions.complete,
    remove: writes.actions.remove,
    slot: (start, end) => setSlot({ start, end }),
  };
  // The editor follows the latest cached copy (a pristine form picks up other devices' edits).
  const task = editing ? tasks.find(item => item.id === editing) : undefined;
  const overlay = <>
    {task && <TaskEditor key={task.id} task={task} onClose={() => setEditing(null)}
      onSave={async (details) => { await writes.update.mutateAsync({ id: task.id, details }); setEditing(null); }} />}
    {slot && <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSlot(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog">
        <Composer startOpen dueDate={() => slot.start.toISOString()} dueDateEnd={() => slot.end.toISOString()}
          destination={dayDestination(slot.start, now)}
          onCancel={() => setSlot(null)} onCreate={async (created) => { await writes.create.mutateAsync(created); setSlot(null); }} />
      </div>
    </div>}
  </>;
  return { writes, slots, overlay, now };
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
  const { slots, overlay, writes, now } = useSchedule(account, tasks);
  const composer = (day: Date): ReactNode => <Composer dueDate={() => startOfDay(day).toISOString()} destination={dayDestination(day, now)}
    onCreate={(task) => writes.create.mutateAsync(task)} />;
  let body: ReactNode;
  if (query.status === "pending") body = <p className="state" role="status">Loading tasks…</p>;
  else if (!query.data) body = <Failure error={query.error} onRetry={() => void query.refetch()} />;
  else body = <>
    {query.status === "error" && <Failure error={query.error} onRetry={() => void query.refetch()} />}
    {writes.error && <p role="alert" className="form-error">{writes.error}</p>}
    {layout === "calendar" ? <CalendarView tasks={tasks} events={events} slots={slots} now={now} /> : <UpcomingList tasks={tasks} events={events} slots={slots} composer={composer} now={now} />}
  </>;
  return <div><h1 className="page-title upcoming-title">Upcoming</h1>{body}{overlay}</div>;
}

/** Legacy composer date chip: Today, Tomorrow or "d MMM". */
export function dayDestination(day: Date, now = new Date()) {
  const label = labels.day(day, now).split(" · ");
  return label.length === 3 ? label[1] : label[0];
}
