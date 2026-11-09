// Goals ticket 29: a Coach draft's pending changes, shown in place while they
// wait (nothing is written until accepted): a moved task dashed with its new
// time, a removed one struck through and hatched, new tasks and sub-tasks as
// dashed rows, new attachments as dashed chips. Lists, Today, the task sheet
// and the task page read this context; the calendar draws its own blocks
// (schedule-views DraftBlock). Shell provides it from the open drafts.
import { createContext, useContext, type CSSProperties } from "react";
import { CornerDownRight, Paperclip, Sparkles } from "lucide-react";
import type { DraftDto, DraftItemDto } from "./coach";
import { draftTime } from "./draft-views";
import { dayKey } from "./schedule";
import { cn } from "./ui";

export interface PendingChanges {
  /** A pending move, remove or (a task to plan placed) add, by the existing task it changes. */
  byTask: ReadonlyMap<string, DraftItemDto>;
  /** New sub-tasks and attachments by the task they go under (an existing task's ID, or a new task's item ID). */
  under: ReadonlyMap<string, DraftItemDto[]>;
  /** New tasks, in draft order. */
  added: DraftItemDto[];
}
const none: PendingChanges = { byTask: new Map(), under: new Map(), added: [] };
export const PendingChangesContext = createContext<PendingChanges>(none);
export const usePendingChanges = () => useContext(PendingChangesContext);

/** Every open draft's pending items, grouped for the views. */
export function pendingChanges(drafts: readonly DraftDto[]): PendingChanges {
  const byTask = new Map<string, DraftItemDto>(), under = new Map<string, DraftItemDto[]>(), added: DraftItemDto[] = [];
  for (const item of drafts.flatMap(draft => draft.items.filter(row => row.state === "pending"))) {
    const parent = item.parentId ?? item.parentItemId;
    if ((item.op === "subtask" || item.op === "attach") && parent) under.set(parent, [...under.get(parent) ?? [], item]);
    else if (item.taskId) byTask.set(item.taskId, item);
    else if (item.op === "add") added.push(item);
  }
  return { byTask, under, added };
}

/** A task row's look for its pending change (Tailwind on the legacy row): dashed in its goal colour, or struck through and hatched. */
export function pendingRowClass(change: DraftItemDto | undefined) {
  if (!change) return "";
  return change.op === "remove" ? "bg-hatched opacity-70 [&_.task-title]:line-through" : "rounded-md outline-1 outline-dashed -outline-offset-1 outline-brand";
}

/** The chip that says what the Coach would change: "Coach: Tue 10:00–10:45" or "Coach: off the schedule". */
export function PendingChip({ change }: { change: DraftItemDto }) {
  return <span className="pill border border-dashed border-brand text-brand" data-pending-change={change.op}>
    <Sparkles aria-hidden="true" /><span className="sr-only">Coach draft: </span>{change.op === "remove" ? "Off the schedule" : draftTime(change, true)}
  </span>;
}

/** New attachments as dashed chips (row meta, the task sheet and page). */
export function PendingAttachments({ items, className }: { items: readonly DraftItemDto[]; className?: string }) {
  const files = items.filter(item => item.op === "attach");
  if (!files.length) return null;
  return <span className={cn("inline-flex flex-wrap gap-1", className)}>{files.map(item => <span key={item.id} data-pending-attachment={item.id}
    className="pill border border-dashed border-brand text-brand"><Paperclip aria-hidden="true" /><span className="sr-only">Coach draft, attach: </span>{item.title}</span>)}</span>;
}

/** A dashed row for a new task or sub-task, with what goes under it; not a task yet, so nothing to open or complete. */
export function PendingTaskRow({ item, depth = 0, color }: { item: DraftItemDto; depth?: number; color?: string | null }) {
  const pending = usePendingChanges();
  const below = pending.under.get(item.id) ?? [];
  return <>
    <div className="task-row rounded-md outline-1 outline-dashed -outline-offset-1 outline-brand" data-pending-task={item.id} data-pending-op={item.op}
      data-depth={depth || undefined} style={{ ...(depth ? { "--depth": depth } : {}), ...(color ? { outlineColor: color } : {}) } as CSSProperties}>
      <span className="checkbox border-dashed" aria-hidden="true" style={color ? { borderColor: color } : undefined} />
      <div className="row-body">
        <span className="task-title text-muted-foreground"><span className="sr-only">Coach draft, {item.op === "subtask" ? "new sub-task" : "new task"}: </span>{item.title}</span>
        <div className="row-meta">
          {item.op === "add" && <span className="pill text-brand"><Sparkles aria-hidden="true" />{draftTime(item, true)}</span>}
          {item.op === "subtask" && <span className="pill"><CornerDownRight aria-hidden="true" />Sub-task</span>}
          <PendingAttachments items={below} />
        </div>
      </div>
    </div>
    {below.filter(child => child.op === "subtask").map(child => <PendingTaskRow key={child.id} item={child} depth={depth + 1} color={color} />)}
  </>;
}

/** New sub-tasks under an existing task's row. */
export function PendingSubtaskRows({ taskId, depth }: { taskId: string; depth: number }) {
  return <>{(usePendingChanges().under.get(taskId) ?? []).filter(item => item.op === "subtask").map(item => <PendingTaskRow key={item.id} item={item} depth={depth + 1} />)}</>;
}

/** New tasks: all of them (the Inbox, where they land), or those due on `day` (Today). */
export function PendingNewTasks({ day }: { day?: string }) {
  const added = usePendingChanges().added.filter(item => !day || dayKey(new Date(item.start)) === day);
  return <>{added.map(item => <PendingTaskRow key={item.id} item={item} />)}</>;
}
