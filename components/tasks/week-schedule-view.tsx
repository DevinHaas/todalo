"use client";

import { useState } from "react";
import { addDays, eachDayOfInterval, format, isToday, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { TaskComposer } from "@/components/tasks/task-composer";
import { AllDayRow, ScheduleGrid, scheduleGridTemplate } from "@/components/tasks/schedule-grid";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { hasDueTime } from "@/lib/task-dates";
import type { Task } from "@/lib/tasks";

export function WeekScheduleView({ tasks }: { tasks: Task[] }) {
  const { showCompleted } = useDisplaySettings();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [slot, setSlot] = useState<{ day: Date; start: Date; end: Date } | null>(null);
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const gridTemplate = scheduleGridTemplate(days);

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const tasksByDate = new Map<string, Task[]>();
  for (const task of visibleTasks) {
    if (!task.dueDate) continue;
    const key = format(new Date(task.dueDate), "yyyy-MM-dd");
    tasksByDate.set(key, [...(tasksByDate.get(key) ?? []), task]);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, -7))}>
          Prev
        </Button>
        <h2 className="text-lg font-medium">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addDays(d, 7))}>
          Next
        </Button>
      </div>

      <ScheduleGrid
        days={days}
        tasksByDate={tasksByDate}
        onSlotClick={(day, start, end) => setSlot({ day, start, end })}
        header={
          <>
            <div className="grid pt-2 text-center text-sm" style={gridTemplate}>
              <div />
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={
                    "border-l first:border-l-0 " +
                    (isToday(day) ? "font-semibold text-primary" : "text-muted-foreground")
                  }
                >
                  {format(day, "EEE d")}
                </div>
              ))}
            </div>

            <div className="grid pb-2 pt-1" style={gridTemplate}>
              <div className="pt-0.5 text-xs text-muted-foreground">All day</div>
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const allDayTasks = (tasksByDate.get(key) ?? []).filter(
                  (t) => !t.dueDate || !hasDueTime(new Date(t.dueDate))
                );
                return (
                  <div key={key} className="space-y-0.5 border-l px-1 first:border-l-0 first:pl-0">
                    {allDayTasks.map((task) => (
                      <AllDayRow key={task.id} task={task} />
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        }
      />

      <TaskComposer
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
        initialDueDate={slot?.day}
        initialStartTime={slot ? format(slot.start, "HH:mm") : undefined}
        initialEndTime={slot ? format(slot.end, "HH:mm") : undefined}
      />
    </div>
  );
}
