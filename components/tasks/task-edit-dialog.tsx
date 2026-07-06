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
import { combineDateAndTime, hasDueTime } from "@/lib/task-dates";
import { TimeRangeInputs } from "@/components/tasks/time-range-inputs";
import type { Task } from "@/lib/tasks";
import type { Recurrence } from "@/lib/recurrence";

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

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
  const [startTime, setStartTime] = useState(
    task.dueDate && hasDueTime(new Date(task.dueDate)) ? formatTime(new Date(task.dueDate)) : "",
  );
  const [endTime, setEndTime] = useState(
    task.dueDateEnd ? formatTime(new Date(task.dueDateEnd)) : "",
  );
  const [recurrenceValue, setRecurrenceValue] = useState(
    task.recurrence?.type ?? "none",
  );
  const [isPending, startTransition] = useTransition();

  function save() {
    const recurrence =
      RECURRENCE_OPTIONS.find((o) => o.value === recurrenceValue)?.recurrence ??
      undefined;
    const finalDueDate = dueDate && startTime ? combineDateAndTime(dueDate, startTime) : dueDate;
    const dueDateEnd = dueDate && endTime ? combineDateAndTime(dueDate, endTime) : undefined;
    startTransition(async () => {
      await updateTask({
        id: task.id,
        dueDate: finalDueDate,
        dueDateEnd,
        recurrence: recurrence ?? undefined,
      });
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
            {dueDate && (
              <div className="mt-2">
                <TimeRangeInputs
                  startTime={startTime}
                  endTime={endTime}
                  onStartTimeChange={setStartTime}
                  onEndTimeChange={setEndTime}
                />
              </div>
            )}
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
