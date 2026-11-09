// Upcoming and Today's calendar layouts (ticket 16). Both read the Today query:
// it is the full owned-task collection (getTasksForUser), exactly what the legacy
// Upcoming page loaded, so every task write already refreshes these views.
import { useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { coach, coachReads, goalReads, metadataReads, projectReads, reads, seasonReads } from "./runtime";
import { draftMutations, type DraftDto } from "./coach";
import { DraftPanel } from "./draft-views";
import { goalColorValue } from "./goals";
import { useTaskWrites } from "./task-writes";
import { Composer, Failure, listTree, TaskDialogs, TaskRow, type SelectionSlots } from "./views";
import { CalendarView, TodaySchedule, UpcomingList, useDisplay, type DraftBlock, type PlannerSlots, type ScheduleSlots } from "./schedule-views";
import {
  addDays, datedDetails, dayKey, dropRange, dueDetails, durationOf, freeMinutesLeft, goalOf, labels, nextFreeSlot, parseDayKey, planGroupOrder, planGroups, rescheduledDetails,
  sameDay, scheduledDetails, startOfDay, startOfWeek, unscheduledDetails,
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
import { reportCoachError } from "./coach-errors";

/** Rows, edit dialog and slot composer shared by the schedule layouts. */
function useSchedule(account: Account, tasks: TaskDto[], { projectId = null, selection, planner: scope }: { projectId?: string | null; selection?: SelectionSlots; planner?: "day" | "week" } = {}) {
  const withPlanner = scope !== undefined;
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
  const planner = usePlanner(account.user.id, tasks, writes, scope, slots.open, projectNames);
  if (withPlanner) slots.planner = planner.slots;
  const overlay = <>
    {slot && <div className="dialog-backdrop pt-0" onClick={(event) => { if (event.target === event.currentTarget) setSlot(null); }}>
      <div role="dialog" aria-modal="true" aria-label="Add task" className="dialog mt-[60vh] -translate-y-1/2">
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
function usePlanner(userId: string, tasks: TaskDto[], writes: ReturnType<typeof useTaskWrites>, scope: "day" | "week" | undefined, openTask: (task: TaskDto) => void, projectNames: Record<string, string>) {
  const enabled = scope !== undefined;
  const goals = useQuery({ ...goalReads.list(userId), enabled });
  const links = useQuery({ ...goalReads.links(userId), enabled });
  const metadata = useQuery({ ...metadataReads.list(userId), enabled });
  const projects = useQuery({ ...projectReads.list(userId), enabled });
  // Ticket 31: the season's tiers order the undated sections; the week's events count against Now.
  const season = useQuery({ ...seasonReads.current(userId), enabled });
  const events = useCalendarEvents(userId);
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
  // Ticket 20: beside the week calendar the Coach drafts the week it shows.
  const [week, setWeek] = useState(() => dayKey(startOfWeek(new Date(), 1)));
  const coachDraft = useCoachDraft(userId, enabled, scope === "week" ? { kind: "week", period: week } : { kind: "day", period: dayKey(new Date()) });
  const taskColor = (task: TaskDto) => { const goal = goalOf(task, goalList, goalLinks); return goal ? goalColorValue(goal.color) : null; };
  const slots: PlannerSlots = {
    taskColor,
    draft: coachDraft.blocks((item) => {
      const task = item.taskId ? find(item.taskId) : undefined;
      const goal = item.goalId ? goalList.find(entry => entry.id === item.goalId) : undefined;
      return task ? taskColor(task) : goal ? goalColorValue(goal.color) : null;
    }),
    change: (task, start, end) => write(task, scheduledDetails(task, start, end)),
    unschedule: (task) => quietly(write(task, unscheduledDetails(task))),
    incoming: drag.over,
    week: (start) => setWeek(dayKey(start)),
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
  const tiers = new Map((season.data?.season?.goals ?? []).map(goal => [goal.goalId, goal.tier]));
  const groups = planGroups(tasks, goalList, goalLinks, { projectId, skip: new Set(ritualItems.keys()), tiers }, now);
  // Ticket 31: what Now needs (30 min without an estimate) against the open time left this week.
  const nowLoad = { minutes: groups.now.reduce((sum, { task }) => sum + durationOf(task), 0), free: freeMinutesLeft(tasks, events, addDays(startOfWeek(now, 1), 7), now) };
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
    projectId={projectId} onProject={setProjectId} ritual={ritual} coach={coachDraft.panel} remember={`todalo:plan-closed-v2:${userId}`} nowLoad={nowLoad}
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

/**
 * Goals ticket 19: the Coach's open draft of today, for the Plan sidebar and
 * the schedule. Nothing at all without a connected provider. Ticket 20: or of
 * the week shown (`period`: its Monday).
 */
function useCoachDraft(userId: string, enabled: boolean, scope: { kind: "day" | "week"; period: string }) {
  const cache = useQueryClient();
  const provider = useQuery({ ...coachReads.provider(userId), enabled });
  const connected = Boolean(provider.data?.provider);
  const drafts = useQuery({ ...coachReads.drafts(userId), enabled: enabled && connected });
  const writes = useMemo(() => draftMutations(coach, cache, userId), [cache, userId]);
  const [message, setMessage] = useState<string | null>(null);
  const propose = useMutation({
    mutationFn: (target: typeof scope) => target.kind === "week" ? writes.draftWeek(target.period) : writes.draftDay(), onMutate: () => setMessage(null),
    onSuccess: (result, target) => setMessage(result.draft || reportCoachError(result.error, { retry: () => propose.mutate(target) }) ? null : result.message ?? null),
    meta: { action: (target: typeof scope) => `draft your ${target.kind}` },
  });
  // Another week shown: its own draft, and no message left from the last one.
  useEffect(() => { setMessage(null); }, [scope.kind, scope.period]);
  const decide = useMutation({ mutationFn: writes.decide, meta: { action: ({ accept }: { accept: boolean }) => accept ? "accept the draft" : "decline the draft" } });
  // Ticket 28: Yes or No to the overflow; Yes's day draft shows on Today (or the week it lands in).
  const overflow = useMutation({ mutationFn: writes.overflow, onSuccess: (result) => setMessage(result.message ?? result.next?.summary ?? null), meta: { action: ({ schedule }: { schedule: boolean }) => schedule ? "schedule the tasks that didn't fit" : "drop the tasks that didn't fit" } });
  // Ticket 28: the overflow's day draft sits on a later day: Today shows it when today has none, a week when it falls in it.
  const today = dayKey(new Date());
  const later = (item: DraftDto) => item.kind === "day" && item.period > today && (scope.kind === "day" || (item.period >= scope.period && item.period <= dayKey(addDays(parseDayKey(scope.period), 6))));
  const draft = drafts.data?.drafts.find(item => item.kind === scope.kind && item.period === scope.period) ?? drafts.data?.drafts.find(later) ?? null;
  const pending = draft?.items.filter(item => item.state === "pending") ?? [];
  // Ticket 22: a draft from the Coach chat shows dashed too (it is decided in the chat).
  // Ticket 23: and a planning session's timed tasks (its milestones have no time).
  // Ticket 29: only schedule changes are blocks (sub-tasks and attachments show in lists and the task sheet).
  // Every other open draft's timed changes show too (a day draft's item the Coach moved to Wednesday shows on Wednesday).
  const chatPending = drafts.data?.drafts.filter(item => item.id !== draft?.id).flatMap(item => item.items.filter(row => row.state === "pending" && (item.kind === "chat" || row.end))) ?? [];
  return {
    // Ticket 30: a move that only changes the project or section leaves the schedule as it is; ticket 31: so does a new horizon (ticket 32: and a Keep).
    blocks: (color: (item: (typeof pending)[number]) => string | null): DraftBlock[] => [...pending, ...chatPending].flatMap(item => item.op === "subtask" || item.op === "attach" || item.op === "horizon" || item.op === "keep" || item.place?.keepsDate ? [] : [{
      itemId: item.id, op: item.op, taskId: item.taskId, title: item.title, start: new Date(item.start), end: item.end ? new Date(item.end) : null, color: color(item),
    }]),
    panel: connected ? <DraftPanel scope={scope.kind} week={scope.kind === "week" ? labels.week(parseDayKey(scope.period)) : undefined}
      draft={draft} drafting={propose.isPending} deciding={decide.isPending || overflow.isPending} message={message}
      onDraft={() => propose.mutate(scope)} onDecide={(accept, itemIds) => decide.mutate({ draftId: draft!.id, accept, itemIds })}
      onOverflow={(schedule) => overflow.mutate({ draftId: draft!.id, schedule })} /> : null,
  };
}

/** The week Calendar layout of a project or task collection (legacy ViewSwitcher default CalendarView); a slot adds a task to the project (else the Inbox). */
export function ProjectCalendar({ account, tasks, projectId }: { account: Account; tasks: TaskDto[]; projectId?: string }) {
  const { slots, overlay, writes, now } = useSchedule(account, tasks, { projectId });
  const events = useCalendarEvents(account.user.id);
  return <><CalendarView tasks={tasks} events={events} slots={slots} now={now} />{overlay}</>;
}

/** Today's Calendar layout: the legacy daily schedule. */
export function TodayCalendar({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { planner: "day" });
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
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { selection: layout === "list" ? selection : undefined, planner: layout === "calendar" ? "week" : undefined });
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
