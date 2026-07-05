"use client";

import { useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { completeTask, deleteTask } from "@/app/(app)/tasks/actions";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import type { Task } from "@/lib/tasks";

export function TaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 border-b py-2">
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
      {task.dueDate && (
        <span className="text-xs text-muted-foreground">
          {new Date(task.dueDate).toLocaleDateString()}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => startTransition(() => deleteTask(task.id))}
      >
        Delete
      </Button>
    </div>
  );
}
