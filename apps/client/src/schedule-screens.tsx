// Upcoming and Today's calendar layouts (ticket 16). Both read the Today query:
// it is the full owned-task collection (getTasksForUser), exactly what the legacy
// Upcoming page loaded, so every task write already refreshes these views.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Account } from "./session";
import { goalReads, metadataReads, projectReads, reads, timeBlockReads, timeBlocks } from "./runtime";
import { goalColorValue } from "./goals";
import { timeBlockMutations, type BlockOutcome, type TimeBlockDto } from "./time-blocks";
import { GoalTimeSummary, TimeBlockDialog } from "./time-block-views";
import { useEditorExtras, useTaskWrites } from "./task-writes";
import { Composer, Failure, listTree, TaskEditor, TaskRow, type SelectionSlots } from "./views";
import { CalendarView, TodaySchedule, UpcomingList, useDisplay, type BlockSlots, type ScheduleSlots } from "./schedule-views";
import { DEFAULT_DURATION_MINUTES, blockItem, dayKey, defaultBlockRange, dropRange, labels, parseDayKey, startOfDay, toggledOutcome, unscheduledTasks, weekGoalTime, type UnscheduledFilter } from "./schedule";
import { UnscheduledSidebar, dropTargetAt, useTaskDrag } from "./unscheduled-views";
import { useBulkWrites } from "./bulk-screens";
import { Button } from "./ui";
import type { TaskDto } from "./tasks";
import { useCalendarEvents } from "./calendar-screens";
import { BoardScreen } from "./board-screens";
import { useBulkSelection } from "./bulk-screens";

/** Rows, edit dialog and slot composer shared by the schedule layouts. */
function useSchedule(account: Account, tasks: TaskDto[], { projectId = null, selection, blocks: withBlocks = false }: { projectId?: string | null; selection?: SelectionSlots; blocks?: boolean } = {}) {
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
  const blocks = useBlockSlots(account.user.id, tasks, writes, withBlocks, slots.open, projectNames);
  if (withBlocks) slots.blocks = blocks.slots;
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
    {blocks.overlay}
  </>;
  return { writes, slots, overlay, now, sidebar: blocks.sidebar };
}

/** The schedule with the right sidebar beside it (ticket 08). */
const Planner = ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) =>
  <div className="flex items-start gap-4"><div className="min-w-0 flex-1">{children}</div>{sidebar}</div>;

/**
 * Goals ticket 07: time blocks in their goal's colour, created by dragging over
 * an empty slot, moved and resized by dragging. A dragged task block writes the
 * task's own dueDate/dueDateEnd; nothing about task scheduling is stored as a block.
 * Ticket 08: the unscheduled sidebar; a task dropped on a free slot is scheduled
 * (its own dates, so it shows as a single-task block), one dropped on a block goes into it.
 */
function useBlockSlots(userId: string, tasks: TaskDto[], writes: ReturnType<typeof useTaskWrites>, enabled: boolean, openTask: (task: TaskDto) => void, projectNames: Record<string, string>) {
  const cache = useQueryClient();
  const mutations = useMemo(() => timeBlockMutations(timeBlocks, cache, userId), [cache, userId]);
  const list = useQuery({ ...timeBlockReads.list(userId), enabled });
  const goals = useQuery({ ...goalReads.list(userId), enabled });
  const links = useQuery({ ...goalReads.links(userId), enabled });
  const metadata = useQuery({ ...metadataReads.list(userId), enabled });
  const projects = useQuery({ ...projectReads.list(userId), enabled });
  const priority = useMutation(useBulkWrites(userId).metadata);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filter, setFilter] = useState<UnscheduledFilter>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const goalList = goals.data?.goals ?? [];
  const byId = new Map(goalList.map(goal => [goal.id, goal]));
  const report = (reason: unknown) => { setError(reason instanceof Error ? reason.message : "Your changes could not be saved. Try again."); throw reason; };
  const schedule = (task: TaskDto, start: Date, end: Date) => writes.update.mutateAsync({ id: task.id, details: {
    updatedAt: task.updatedAt ?? "", title: task.title, description: task.description ?? "", priority: task.priority,
    deadline: task.deadline, dueDate: start.toISOString(), dueDateEnd: end.toISOString(), recurrence: task.recurrence,
  } });
  const quietly = (write: Promise<unknown>) => { setError(null); void write.catch(report).catch(() => {}); };
  const addToBlock = (task: TaskDto, blockId: string) => quietly(mutations.setTask(blockId, task.id, true));
  const drop = (task: TaskDto, x: number, y: number) => {
    const target = dropTargetAt(x, y);
    const blockId = target?.dataset.timeBlockId;
    if (blockId) { if (!blockId.startsWith("pending-")) addToBlock(task, blockId); return; }
    if (!target?.dataset.day) return;
    const { start, end } = dropRange(parseDayKey(target.dataset.day), y - target.getBoundingClientRect().top);
    quietly(schedule(task, start, end));
  };
  const drag = useTaskDrag(drop);
  // Ticket 09: outcomes from the dialog or the keyboard (b then d/s/r on a focused block).
  const mark = (block: TimeBlockDto, outcome: BlockOutcome) => mutations.setOutcome(block.id, toggledOutcome(block.outcome, outcome));
  const blockList = list.data ?? [];
  useEffect(() => {
    const onOutcome = (event: Event) => {
      const { id, outcome } = (event as CustomEvent<{ id: string; outcome: BlockOutcome }>).detail;
      const block = blockList.find(item => item.id === id);
      if (block && !id.startsWith("pending-")) quietly(mark(block, outcome));
    };
    window.addEventListener("todalo:block-outcome", onOutcome);
    return () => window.removeEventListener("todalo:block-outcome", onOutcome);
  });
  const weekRows = goals.data?.hidden ? [] : weekGoalTime(blockList).flatMap(row => { const goal = byId.get(row.goalId); return goal ? [{ ...row, title: goal.title, color: goal.color }] : []; });
  const slots: BlockSlots = {
    blocks: list.data ?? [],
    goal: (goalId) => { const goal = goalId ? byId.get(goalId) : undefined; return goal && { title: goal.title, color: goalColorValue(goal.color) }; },
    taskColor: (task) => {
      const goal = links.data?.tasks.map(link => link.taskId === task.id ? byId.get(link.goalId) : undefined).find(Boolean);
      return goal ? goalColorValue(goal.color) : null;
    },
    create: (start, end) => { setError(null); void mutations.create({ start: start.toISOString(), end: end.toISOString() }).then(block => setEditing(block.id), () => setError("The time block could not be saved. Try again.")); },
    open: (block) => setEditing(block.id),
    change: (item, start, end) => {
      setError(null);
      if (item.block) return mutations.update(item.block.id, { start: start.toISOString(), end: end.toISOString() }).catch(report);
      return schedule(item.task!, start, end).catch(report);
    },
    tasksIn: (block) => block.taskIds.map(id => tasks.find(task => task.id === id)).filter((task): task is TaskDto => Boolean(task)),
    summary: <GoalTimeSummary rows={weekRows} />,
    toolbar: <Button type="button" variant={sidebarOpen ? "secondary" : "outline"} size="sm" aria-pressed={sidebarOpen} data-schedule-action="unscheduled" onClick={() => setSidebarOpen(open => !open)}>Unscheduled</Button>,
  };
  const now = new Date();
  const goalChoices = goals.data?.hidden ? [] : goalList.map(goal => ({ id: goal.id, title: goal.title, color: goalColorValue(goal.color) }));
  const sidebar = enabled && sidebarOpen && <UnscheduledSidebar
    tasks={unscheduledTasks(tasks, slots.blocks, goals.data?.hidden ? { ...filter, goalId: undefined } : filter, links.data ?? { projects: [], tasks: [] })}
    choices={{
      goals: goalChoices,
      projects: (projects.data ?? []).map(project => ({ id: project.id, name: project.name })),
      labels: (metadata.data?.labels ?? []).map(label => ({ id: label.id, name: label.name })),
      blocks: slots.blocks.filter(block => new Date(block.end) > now && !block.id.startsWith("pending-")).map(block => ({ id: block.id, title: blockItem(block, slots.goal(block.goalId)).title, start: new Date(block.start), end: new Date(block.end) })),
    }}
    filter={filter} onFilter={setFilter} onClose={() => setSidebarOpen(false)} onOpen={openTask} onDragStart={drag.start}
    projectName={(task) => task.projectId ? projectNames[task.projectId] : undefined}
    onPriority={(task, value) => quietly(priority.mutateAsync({ tasks: [task], change: { priority: value } }))}
    onNextSlot={(task) => { const { start } = defaultBlockRange(new Date()); quietly(schedule(task, start, new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000))); }}
    onAddToBlock={addToBlock} />;
  const block: TimeBlockDto | undefined = editing ? slots.blocks.find(item => item.id === editing) : undefined;
  const overlay = <>
    {error && <p role="alert" className="form-error">{error}</p>}
    {block && <TimeBlockDialog key={block.id} block={block} goals={goals.data?.hidden ? [] : goalList} tasks={slots.tasksIn(block)}
      onSave={(patch) => mutations.update(block.id, patch)} onDelete={() => mutations.remove(block.id)} onClose={() => setEditing(null)}
      onRemoveTask={(taskId) => mutations.setTask(block.id, taskId, false)} onOutcome={(outcome) => mark(block, outcome)} />}
    {drag.preview}
  </>;
  return { slots, overlay, sidebar: sidebar || null };
}

/** The week Calendar layout of a project or task collection (legacy ViewSwitcher default CalendarView); a slot adds a task to the project (else the Inbox). */
export function ProjectCalendar({ account, tasks, projectId }: { account: Account; tasks: TaskDto[]; projectId?: string }) {
  const { slots, overlay, writes, now } = useSchedule(account, tasks, { projectId });
  const events = useCalendarEvents(account.user.id);
  return <>{writes.error && <p role="alert" className="form-error">{writes.error}</p>}<CalendarView tasks={tasks} events={events} slots={slots} now={now} />{overlay}</>;
}

/** Today's Calendar layout: the legacy daily schedule. */
export function TodayCalendar({ account, tasks }: { account: Account; tasks: TaskDto[] }) {
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { blocks: true });
  const events = useCalendarEvents(account.user.id);
  return <>{writes.error && <p role="alert" className="form-error">{writes.error}</p>}<Planner sidebar={sidebar}><TodaySchedule tasks={tasks} events={events} slots={slots} now={now} /></Planner>{overlay}</>;
}

export function UpcomingScreen({ account }: { account: Account }) {
  const query = useQuery(reads.today(account.user.id));
  const { layout, calendarRange } = useDisplay();
  const events = useCalendarEvents(account.user.id);
  const tasks = query.data?.tasks ?? [];
  // Ticket 15 selection on the list layout (legacy TaskKeyboardProvider wrapped Upcoming too).
  const selection = useBulkSelection(account.user.id, tasks);
  const { slots, overlay, writes, now, sidebar } = useSchedule(account, tasks, { selection: layout === "list" ? selection : undefined, blocks: layout === "calendar" });
  const composer = (day: Date): ReactNode => <Composer dueDate={() => startOfDay(day).toISOString()} destination={dayDestination(day, now)}
    onCreate={(task) => writes.create.mutateAsync(task)} />;
  let body: ReactNode;
  if (query.status === "pending") body = <p className="state" role="status">Loading tasks…</p>;
  else if (!query.data) body = <Failure error={query.error} onRetry={() => void query.refetch()} />;
  else body = <>
    {query.status === "error" && <Failure error={query.error} onRetry={() => void query.refetch()} />}
    {writes.error && <p role="alert" className="form-error">{writes.error}</p>}
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
