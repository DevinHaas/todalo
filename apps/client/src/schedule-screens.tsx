// Upcoming and Today's calendar layouts (ticket 16). Both read the Today query:
// it is the full owned-task collection (getTasksForUser), exactly what the legacy
// Upcoming page loaded, so every task write already refreshes these views.
import { useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { goalReads, metadataReads, projectReads, reads } from "./runtime";
import { goalColorValue } from "./goals";
import { useTaskWrites } from "./task-writes";
import { Composer, Failure, listTree, TaskDialogs, TaskRow, type SelectionSlots } from "./views";
import { CalendarView, TodaySchedule, UpcomingList, useDisplay, type PlannerSlots, type ScheduleSlots } from "./schedule-views";
import {
  addDays, datedDetails, dayKey, dropRange, dueDetails, durationOf, goalOf, labels, nextFreeSlot, parseDayKey, planGroupOrder, planGroups, rescheduledDetails,
  sameDay, scheduledDetails, startOfDay, unscheduledDetails,
} from "./schedule";
import { PlanSidebar, planRitual, useTaskDrag, type PlanRowData } from "./plan-views";
import { Button } from "./ui";
import { isDueToday, isOverdue, shortDateLabel, taskKeys, type TaskDto, type TodayDto } from "./tasks";
import { subtasksOf } from "./task-tree";
import { toasts } from "./toasts";
import { useRitualTaskIds } from "./ritual-screens";
import { useCalendarEvents } from "./calendar-screens";
import { BoardScreen } from "./board-screens";
import { useBulkSelection } from "./bulk-screens";

/** Rows, edit dialog and slot composer shared by the schedule layouts. */
function useSchedule(account: Account, tasks: TaskDto[], { projectId = null, selection, planner: withPlanner = false }: { projectId?: string | null; selection?: SelectionSlots; planner?: boolean } = {}) {
  const writes = useTaskWrites(account.user.id);
  const projects = useQuery(projectReads.list(account.user.id));
  const projectNames = Object.fromEntries((projects.data ?? []).map(project => [project.id, project.name]));
  // Opening a task uses the shell's full sheet (sub-tasks, comments, goals, milestone), as list rows do.
  const dialog = useContext(TaskDialogs);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const now = new Date();
  // Indent a sub-task under its parent when both are listed on the same day.
  const day = (task: TaskDto) => task.dueDate ? dayKey(new Date(task.dueDate)) : "";
  const trees = new Map<string, ReturnType<typeof listTree>>();
  const treeOf = (task: TaskDto) => { const key = day(task); if (!trees.has(key)) trees.set(key, listTree(tasks.filter(item => day(item) === key))); return trees.get(key)!(task); };
  const slots: ScheduleSlots = {
    row: task => <TaskRow key={task.id} task={task} now={now} projectName={task.projectId ? projectNames[task.projectId] : undefined} actions={writes.actions} selection={selection?.row(task)} {...treeOf(task)} />,
    open: task => dialog?.open(task.id),
    complete: writes.actions.complete,
    remove: writes.actions.remove,
    slot: (start, end) => setSlot({ start, end }),
  };
  const planner = usePlanner(account.user.id, tasks, writes, withPlanner, slots.open, projectNames);
  if (withPlanner) slots.planner = planner.slots;
  const overlay = <>
    {slot && <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSlot(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog">
        <Composer startOpen projectId={projectId} dueDate={() => slot.start.toISOString()} dueDateEnd={() => slot.end.toISOString()}
          destination={dayDestination(slot.start, now)}
          onCancel={() => setSlot(null)} onCreate={async (created) => { await writes.create.mutateAsync(created); setSlot(null); }} />
      </div>
    </div>}
    {planner.overlay}
  </>;
  return { writes, slots, overlay, now, sidebar: planner.sidebar };
}

const OPEN_PLAN = "todalo:plan";
/** Opens the Plan sidebar on the schedule shown (the Check-in, the Weekly review's planning). */
export const openPlan = () => window.dispatchEvent(new Event(OPEN_PLAN));

/** The schedule with the right sidebar beside it (ticket 08). */
const Planner = ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) =>
  <div className="flex items-start gap-4"><div className="min-w-0 flex-1">{children}</div>{sidebar}</div>;

/**
 * Goals ticket 07 (reworked): a task with a time is a block, in its goal's
 * colour; moving or resizing it writes its own dueDate/dueDateEnd. Ticket 14c:
 * the Plan sidebar beside it; a task dropped on a slot is scheduled for its
 * duration, a scheduled task dropped on the sidebar is unscheduled.
 */
function usePlanner(userId: string, tasks: TaskDto[], writes: ReturnType<typeof useTaskWrites>, enabled: boolean, openTask: (task: TaskDto) => void, projectNames: Record<string, string>) {
  const goals = useQuery({ ...goalReads.list(userId), enabled });
  const links = useQuery({ ...goalReads.links(userId), enabled });
  const metadata = useQuery({ ...metadataReads.list(userId), enabled });
  const projects = useQuery({ ...projectReads.list(userId), enabled });
  const cache = useQueryClient();
  const ritualItems = useRitualTaskIds(userId);
  const ritual = useSyncExternalStore(planRitual.subscribe, planRitual.get);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const show = () => setSidebarOpen(true);
    window.addEventListener(OPEN_PLAN, show);
    return () => window.removeEventListener(OPEN_PLAN, show);
  }, []);
  // Hidden Goals: no goal colours, icons or chips.
  const goalList = goals.data?.hidden ? [] : goals.data?.goals ?? [];
  const goalLinks = links.data ?? { projects: [], tasks: [] };
  // A failed write is toasted (toasts.ts) and rolled back; nothing inline.
  const write = (task: TaskDto, details: ReturnType<typeof scheduledDetails>) => writes.update.mutateAsync({ id: task.id, details });
  const quietly = (promise: Promise<unknown>) => void promise.catch(() => {});
  const drag = useTaskDrag((task, day, y) => { const { start, end } = dropRange(parseDayKey(day), y, durationOf(task)); quietly(write(task, scheduledDetails(task, start, end))); });
  const find = (id: string) => tasks.find(task => task.id === id);
  const withTask = (run: (task: TaskDto) => void) => (id: string) => { const task = find(id); if (task) run(task); };
  const slots: PlannerSlots = {
    taskColor: (task) => { const goal = goalOf(task, goalList, goalLinks); return goal ? goalColorValue(goal.color) : null; },
    change: (task, start, end) => write(task, scheduledDetails(task, start, end)),
    unschedule: (task) => quietly(write(task, unscheduledDetails(task))),
    incoming: drag.over,
    toolbar: <Button type="button" variant={sidebarOpen ? "secondary" : "outline"} size="sm" aria-pressed={sidebarOpen} data-schedule-action="plan" onClick={() => setSidebarOpen(open => !open)}>Plan</Button>,
  };
  /** Overdue › Reschedule: every row to today at once (optimistic), undone from the toast with each task's own dates. */
  const reschedule = (ids: string[]) => {
    const before = ids.flatMap(id => find(id) ?? []);
    before.forEach(task => quietly(write(task, rescheduledDetails(task))));
    const id = "plan-reschedule";
    toasts.add({ id, title: `Rescheduled ${before.length} task${before.length === 1 ? "" : "s"} to today`, actionProps: { children: "Undo", onClick: () => {
      toasts.close(id);
      const current = cache.getQueryData<TodayDto>(taskKeys.today(userId))?.tasks ?? [];
      for (const task of before) { const now = current.find(item => item.id === task.id); if (now) quietly(write(now, datedDetails(now, task))); }
    } } });
  };
  const now = new Date();
  const labelList = metadata.data?.labels ?? [];
  const groups = planGroups(tasks, goalList, goalLinks, { projectId, skip: new Set(ritualItems.keys()) }, now);
  const rowOf = ({ task, goal }: (typeof groups)["today"][number]): PlanRowData => {
    const subtasks = subtasksOf(task.id, tasks);
    return {
      id: task.id, title: task.title, date: shortDateLabel(task, now),
      tone: isOverdue(task, now) ? "overdue" : isDueToday(task, now) ? "today" : task.dueDate && sameDay(new Date(task.dueDate), addDays(startOfDay(now), 1)) ? "tomorrow" : null,
      subtasks: { done: subtasks.done.length, total: subtasks.total }, comments: task.commentCount ?? 0,
      project: task.projectId ? projectNames[task.projectId] ?? null : null,
      goal: goal && { id: goal.id, title: goal.title, color: goal.color, icon: goal.icon },
      labels: labelList.filter(label => task.labelIds.includes(label.id)).map(label => ({ id: label.id, name: label.name })),
      slot: labels.time(nextFreeSlot(tasks, durationOf(task), now).start),
    };
  };
  const sidebar = enabled && (sidebarOpen || ritual) && <PlanSidebar
    // A new Check-in starts its progress afresh.
    key={ritual ? "check-in" : "plan"}
    groups={Object.fromEntries(planGroupOrder.map(group => [group, groups[group].map(rowOf)])) as Record<keyof typeof groups, PlanRowData[]>}
    projects={(projects.data ?? []).map(project => ({ id: project.id, name: project.name }))}
    projectId={projectId} onProject={setProjectId} ritual={ritual}
    slots={{
      onComplete: withTask(writes.actions.complete), onOpen: withTask(openTask),
      onDragStart: (id, event) => { const task = find(id); if (task) drag.start(task, event); },
      onSchedule: (id, time) => withTask(task => {
        const [hours, minutes] = time.split(":").map(Number);
        const start = new Date(); start.setHours(hours!, minutes!, 0, 0);
        quietly(write(task, scheduledDetails(task, start, new Date(start.getTime() + durationOf(task) * 60_000))));
      })(id),
      onDue: (id, day) => withTask(task => quietly(write(task, dueDetails(task, day))))(id),
      onReschedule: reschedule, onAdd: () => setAdding(true),
      onClose: () => setSidebarOpen(false),
    }} />;
  // The Plan's Add task: the Inbox composer over the page, as a slot's composer is.
  const overlay = <>{drag.preview}{adding && <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setAdding(false); }}>
    <div role="dialog" aria-modal="true" aria-label="Add task to the Inbox" className="dialog">
      <Composer startOpen dueDate={() => null} onCancel={() => setAdding(false)} onCreate={(task) => writes.create.mutateAsync(task)} />
    </div>
  </div>}</>;
  return { slots, overlay, sidebar: sidebar || null };
}

/** The week Calendar layout of a project or task collection (legacy ViewSwitcher default CalendarView); a slot adds a task to the project (else the Inbox). */
export function ProjectCalendar({ account, tasks, projectId }: { account: Account; tasks: TaskDto[]; projectId?: string }) {
  const { slots, overlay, writes, now } = useSchedule(account, tasks, { projectId });
  const events = useCalendarEvents(account.user.id);
  return <><CalendarView tasks={tasks} events={events} slots={slots} now={now} />{overlay}</>;
}

/** Today's Calendar layout: the legacy daily schedule. */
export function TodayCalendar({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { planner: true });
  const events = useCalendarEvents(account.user.id);
  return <><Planner sidebar={sidebar}><TodaySchedule tasks={tasks} events={events} slots={slots} now={now} /></Planner>{overlay}</>;
}

export function UpcomingScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  const { layout, calendarRange } = useDisplay();
  const events = useCalendarEvents(account.user.id);
  const tasks = query.data?.tasks ?? [];
  // Ticket 15 selection on the list layout (legacy TaskKeyboardProvider wrapped Upcoming too).
  const selection = useBulkSelection(account.user.id, tasks);
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { selection: layout === "list" ? selection : undefined, planner: layout === "calendar" });
  const composer = (day: Date): ReactNode => <Composer dueDate={() => startOfDay(day).toISOString()} destination={dayDestination(day, now)}
    onCreate={(task) => writes.create.mutateAsync(task)} />;
  let body: ReactNode;
  if (query.status === "pending") body = <p className="state" role="status">Loading tasks…</p>;
  else if (!query.data) body = <Failure error={query.error} onRetry={() => void query.refetch()} />;
  else body = <>
    {query.status === "error" && <Failure error={query.error} onRetry={() => void query.refetch()} />}
    {layout === "board" ? <BoardScreen account={account} tasks={tasks} />
      : layout === "calendar" ? <Planner sidebar={calendarRange === "week" && sidebar}><CalendarView tasks={tasks} events={events} slots={slots} now={now} /></Planner>
      : <>{selection.toolbar}<UpcomingList tasks={tasks} events={events} slots={slots} composer={composer} now={now} /></>}
  </>;
  return <div><div className="project-header"><h1 className="page-title upcoming-title">Upcoming</h1>{layout === "list" && query.data && selection.control}</div>{body}{overlay}</div>;
}

/** Legacy composer date chip: Today, Tomorrow or "d MMM". */
export function dayDestination(day: Date, now = new Date()) {
  const label = labels.day(day, now).split(" · ");
  return label.length === 3 ? label[1] : label[0];
}
