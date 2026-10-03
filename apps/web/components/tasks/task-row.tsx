"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { completeTask, deleteTask } from "@/app/(app)/tasks/actions";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import type { Task } from "@/lib/tasks";
import { useTaskDateLabel } from "./use-task-date-label";
import { isOverdue } from "@/lib/task-dates";
import { DatePill, ProjectPill } from "@/components/tasks/task-pills";
import { useTaskKeyboard } from "./task-keyboard-provider";

export function TaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const deadlineLabel = useTaskDateLabel(task.deadline);
  const keyboard = useTaskKeyboard();
  const selected = keyboard?.selectedIds.has(task.id);
  const titleButton = <button type="button" onClick={keyboard ? () => keyboard.open(task) : undefined} className={task.status === "done" ? "flex-1 text-left line-through text-muted-foreground" : "flex-1 text-left"}>{task.title}</button>;

  return (
    <>
    {keyboard?.creationSlot(task.id, "above")}
    <div data-task-id={task.id} tabIndex={0} aria-label={task.title} onFocus={() => keyboard?.focus(task.id)} hidden={Boolean(task.parentId && keyboard?.collapsedIds.has(task.parentId))} className={`group flex items-center gap-3 border-b py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-primary/10 ring-1 ring-primary" : ""} ${task.parentId ? "ml-6" : ""}`}>
      {selected && <span className="sr-only">Selected</span>}
      <Checkbox
        checked={task.status === "done"}
        disabled={isPending}
        aria-label={`Complete ${task.title}`}
        onCheckedChange={() => keyboard ? keyboard.mutate("complete", [task.id]) : startTransition(() => completeTask(task.id))}
      />
      {keyboard ? titleButton : <TaskEditDialog task={task}>{titleButton}</TaskEditDialog>}
      {dueDate && <DatePill dueDate={dueDate} overdue={isOverdue(task)} />}
      {task.priority < 4 && <span className="text-xs font-semibold" aria-label={`Priority ${task.priority}`}>P{task.priority}</span>}
      {task.deadline && <span className="text-xs text-muted-foreground">Deadline {deadlineLabel}</span>}
      {task.labelIds.length > 0 && <span className="text-xs text-muted-foreground">{task.labelIds.length} label{task.labelIds.length > 1 ? "s" : ""}</span>}
      <ProjectPill />
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Delete ${task.title}`}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={() => keyboard ? keyboard.mutate("delete", [task.id]) : startTransition(() => deleteTask(task.id))}
      >
        <X className="size-4" />
      </Button>
    </div>
    {keyboard?.creationSlot(task.id, "below")}
    </>
  );
}
