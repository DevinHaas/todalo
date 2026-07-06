"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { Inbox, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { completeTask, deleteTask } from "@/app/(app)/tasks/actions";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import type { Task } from "@/lib/tasks";
import { isOverdue } from "@/lib/task-dates";

function formatDueDate(dueDate: Date) {
  const hasTime = dueDate.getHours() !== 0 || dueDate.getMinutes() !== 0;
  return format(dueDate, hasTime ? "d MMM HH:mm" : "d MMM");
}

export function TaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;

  return (
    <div className="group flex items-center gap-3 border-b py-2">
      <Checkbox
        checked={task.status === "done"}
        disabled={isPending}
        onCheckedChange={() => startTransition(() => completeTask(task.id))}
      />
      <TaskEditDialog task={task}>
        <button
          type="button"
          className={
            task.status === "done"
              ? "flex-1 text-left line-through text-muted-foreground"
              : "flex-1 text-left"
          }
        >
          {task.title}
        </button>
      </TaskEditDialog>
      {dueDate && (
        <span
          className={
            isOverdue(task) ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {formatDueDate(dueDate)}
        </span>
      )}
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Inbox className="size-3.5" />
        Inbox
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100"
        onClick={() => startTransition(() => deleteTask(task.id))}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
