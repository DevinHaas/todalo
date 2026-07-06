"use client";

import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import type { Task } from "@/lib/tasks";

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const [month, setMonth] = useState(() => new Date());
  const { calendarRange } = useDisplaySettings();
  const isWeek = calendarRange === "week";

  const gridStart = isWeek ? startOfWeek(month) : startOfWeek(startOfMonth(month));
  const gridEnd = isWeek ? endOfWeek(month) : endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = format(new Date(task.dueDate), "yyyy-MM-dd");
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }

  function goPrev() {
    setMonth((m) => (isWeek ? subWeeks(m, 1) : subMonths(m, 1)));
  }

  function goNext() {
    setMonth((m) => (isWeek ? addWeeks(m, 1) : addMonths(m, 1)));
  }

  const title = isWeek
    ? `${format(gridStart, "MMM d")} – ${format(gridEnd, "MMM d, yyyy")}`
    : format(month, "MMMM yyyy");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goPrev}>
          Prev
        </Button>
        <h2 className="text-lg font-medium">{title}</h2>
        <Button variant="outline" size="sm" onClick={goNext}>
          Next
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-muted p-2 text-center font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={
                (isWeek ? "min-h-[400px]" : "min-h-24") +
                " bg-background p-1 " +
                (isWeek || isSameMonth(day, month) ? "" : "opacity-40")
              }
            >
              <div className={isToday(day) ? "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground" : "mb-1 text-xs"}>
                {format(day, "d")}
              </div>
              {isWeek
                ? dayTasks.map((task) => <TaskRow key={task.id} task={task} />)
                : dayTasks.map((task) => (
                    <TaskEditDialog key={task.id} task={task}>
                      <button
                        type="button"
                        className="mb-1 block w-full truncate rounded bg-accent px-1 py-0.5 text-left text-xs"
                      >
                        {task.title}
                      </button>
                    </TaskEditDialog>
                  ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
