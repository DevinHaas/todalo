// The unscheduled sidebar (goals ticket 08): open tasks without a scheduled time
// beside the schedule, filtered by goal, project, priority and label. A row is
// dragged onto a free slot (schedules the task) or into a block (puts it there);
// its Schedule menu does the same from the keyboard. Pure view: the screen
// passes the tasks, choices and writes.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { CalendarPlus, Flag, GripVertical, X } from "lucide-react";
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Hint, List, ListRow,
  RightSidebar, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui";
import { GoalDot } from "./goal-views";
import { DRAG_THRESHOLD, labels, type UnscheduledFilter } from "./schedule";
import type { TaskDto } from "./tasks";

const ALL = "all", INBOX = "inbox";
const priorityTone = { 1: "text-priority-1", 2: "text-priority-2", 3: "text-priority-3", 4: "text-priority-4" } as Record<number, string>;

/** Where a dragged task can land: a block (by ID) or a day column (by its key). */
const DROP = "[data-time-block-id], [data-day]";
export const dropTargetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>(DROP) ?? null;

/**
 * Pointer drag from a sidebar row (mouse and pen; a finger scrolls the list):
 * a ghost follows the pointer, the block or column under it is marked
 * `data-drop-target`, and release calls `drop` with the pointer position.
 */
export function useTaskDrag(drop: (task: TaskDto, x: number, y: number) => void) {
  const [ghost, setGhost] = useState<{ task: TaskDto; x: number; y: number } | null>(null);
  const start = (task: TaskDto, event: ReactPointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const x0 = event.clientX, y0 = event.clientY;
    let moved = false, marked: HTMLElement | null = null;
    const mark = (target: HTMLElement | null) => {
      if (target === marked) return;
      marked?.removeAttribute("data-drop-target");
      target?.setAttribute("data-drop-target", "");
      marked = target;
    };
    const onMove = (next: PointerEvent) => {
      if (!moved && Math.abs(next.clientX - x0) < DRAG_THRESHOLD && Math.abs(next.clientY - y0) < DRAG_THRESHOLD) return;
      moved = true;
      setGhost({ task, x: next.clientX, y: next.clientY });
      mark(dropTargetAt(next.clientX, next.clientY));
    };
    const onUp = (end: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      mark(null);
      setGhost(null);
      if (moved && end.type === "pointerup") drop(task, end.clientX, end.clientY);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const preview = ghost && <div aria-hidden="true" className="ui pointer-events-none fixed z-50 max-w-sidebar truncate rounded-md border border-border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-popover"
    style={{ left: ghost.x + 12, top: ghost.y + 8 }}>{ghost.task.title}</div>;
  return { start, preview };
}

export interface UnscheduledChoices {
  /** Active goals; empty while Goals is hidden (no goal filter). */
  goals: { id: string; title: string; color: string }[];
  projects: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  /** Upcoming blocks a task can go into from the Schedule menu. */
  blocks: { id: string; title: string; start: Date; end: Date }[];
}

export function UnscheduledSidebar({ tasks, choices, filter, onFilter, onPriority, onNextSlot, onAddToBlock, onOpen, onDragStart, onClose, projectName }: {
  tasks: TaskDto[];
  choices: UnscheduledChoices;
  filter: UnscheduledFilter;
  onFilter: (filter: UnscheduledFilter) => void;
  onPriority: (task: TaskDto, priority: number) => void;
  /** Schedules the task at the next quarter hour today. */
  onNextSlot: (task: TaskDto) => void;
  onAddToBlock: (task: TaskDto, blockId: string) => void;
  onOpen: (task: TaskDto) => void;
  onDragStart: (task: TaskDto, event: ReactPointerEvent) => void;
  onClose: () => void;
  projectName: (task: TaskDto) => string | undefined;
}) {
  const goalItems = [{ value: ALL, label: "All goals" }, ...choices.goals.map(goal => ({ value: goal.id, label: goal.title }))];
  const projectItems = [{ value: ALL, label: "All projects" }, { value: INBOX, label: "Inbox" }, ...choices.projects.map(project => ({ value: project.id, label: project.name }))];
  const priorityItems = [{ value: ALL, label: "All priorities" }, ...[1, 2, 3, 4].map(priority => ({ value: String(priority), label: `Priority ${priority}` }))];
  const labelItems = [{ value: ALL, label: "All labels" }, ...choices.labels.map(label => ({ value: label.id, label: label.name }))];
  const set = (change: Partial<Record<keyof UnscheduledFilter, string>>) => {
    const [key, value] = Object.entries(change)[0] as [keyof UnscheduledFilter, string];
    const next = { ...filter };
    delete next[key];
    if (value !== ALL) Object.assign(next, { [key]: key === "priority" ? Number(value) : key === "projectId" && value === INBOX ? null : value });
    onFilter(next);
  };
  const filterSelect = (key: keyof UnscheduledFilter, label: string, items: { value: string; label: string }[], value: string, first = false) =>
    <Select items={items} value={value} onValueChange={(next) => { if (next) set({ [key]: next as string }); }}>
      <SelectTrigger size="sm" aria-label={label} className="w-full" data-unscheduled-filter={first ? "first" : key}><SelectValue /></SelectTrigger>
      <SelectContent>{items.map(item => <SelectItem key={item.value} value={item.value}>
        {key === "goalId" && item.value !== ALL && <GoalDot color={choices.goals.find(goal => goal.id === item.value)!.color} />}{item.label}
      </SelectItem>)}</SelectContent>
    </Select>;

  return <RightSidebar className="ui" aria-label="Unscheduled tasks" data-unscheduled="" title={<>Unscheduled <span className="font-normal text-muted-foreground">{tasks.length}</span></>}
    actions={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close unscheduled tasks" onClick={onClose}><X /></Button>}>
    <div className="grid grid-cols-2 gap-2">
      {choices.goals.length > 0 && filterSelect("goalId", "Goal", goalItems, filter.goalId ?? ALL, true)}
      {filterSelect("projectId", "Project", projectItems, filter.projectId === null ? INBOX : filter.projectId ?? ALL, choices.goals.length === 0)}
      {filterSelect("priority", "Priority", priorityItems, filter.priority === undefined ? ALL : String(filter.priority))}
      {filterSelect("labelId", "Label", labelItems, filter.labelId ?? ALL)}
    </div>
    {tasks.length === 0 ? <Hint className="py-2">No open tasks without a time.</Hint>
      : <List>{tasks.map(task => <ListRow key={task.id} data-task-id={task.id} className="cursor-grab touch-pan-y select-none" onPointerDown={(event) => onDragStart(task, event)}>
        <GripVertical aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
        <button type="button" className="min-w-0 flex-1 truncate text-left text-sm outline-none focus-visible:underline" onClick={() => onOpen(task)}
          title={projectName(task) ? `${task.title} · ${projectName(task)}` : task.title}>{task.title}</button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Priority ${task.priority}`} data-unscheduled-action="priority" />}>
            <Flag className={priorityTone[task.priority]} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {[1, 2, 3, 4].map(priority => <DropdownMenuItem key={priority} onClick={() => onPriority(task, priority)}>
              <Flag className={priorityTone[priority]} />Priority {priority}
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Schedule ${task.title}`} data-unscheduled-action="schedule" />}>
            <CalendarPlus />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onNextSlot(task)}>Next quarter hour today</DropdownMenuItem>
            {choices.blocks.length > 0 && <DropdownMenuGroup>
              <DropdownMenuLabel>Add to block</DropdownMenuLabel>
              {choices.blocks.map(block => <DropdownMenuItem key={block.id} onClick={() => onAddToBlock(task, block.id)}>
                <span className="min-w-0 flex-1 truncate">{block.title}</span>
                <span className="text-muted-foreground">{labels.weekday(block.start)} {labels.time(block.start)}–{labels.time(block.end)}</span>
              </DropdownMenuItem>)}
            </DropdownMenuGroup>}
          </DropdownMenuContent>
        </DropdownMenu>
      </ListRow>)}</List>}
  </RightSidebar>;
}
