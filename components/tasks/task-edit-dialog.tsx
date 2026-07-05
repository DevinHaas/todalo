"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTask } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks";
import type { Recurrence } from "@/lib/recurrence";

const RECURRENCE_OPTIONS: { value: string; recurrence: Recurrence | null }[] = [
  { value: "none", recurrence: null },
  { value: "daily", recurrence: { type: "daily" } },
  { value: "weekly", recurrence: { type: "weekly" } },
  { value: "monthly", recurrence: { type: "monthly" } },
];

export function TaskEditDialog({
  task,
  children,
}: {
  task: Task;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    task.dueDate ? new Date(task.dueDate) : undefined,
  );
  const [recurrenceValue, setRecurrenceValue] = useState(
    task.recurrence?.type ?? "none",
  );
  const [isPending, startTransition] = useTransition();

  function save() {
    const recurrence =
      RECURRENCE_OPTIONS.find((o) => o.value === recurrenceValue)?.recurrence ??
      undefined;
    startTransition(async () => {
      await updateTask({ id: task.id, dueDate, recurrence: recurrence ?? undefined });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Due date</label>
            <Popover>
              <PopoverTrigger
                render={
                  <Button variant="outline">
                    {dueDate ? dueDate.toLocaleDateString() : "No due date"}
                  </Button>
                }
              />
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Repeat</label>
            <Select
              value={recurrenceValue}
              onValueChange={(value) => value && setRecurrenceValue(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={isPending} className="w-full">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
