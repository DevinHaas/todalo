"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TaskComposer } from "@/components/tasks/task-composer";
import { AllDayRow, ScheduleGrid } from "@/components/tasks/schedule-grid";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { isDueToday, isOverdue, hasDueTime } from "@/lib/task-dates";
import type { Task } from "@/lib/tasks";

export function TodayScheduleView({ tasks }: { tasks: Task[] }) {
  const { showCompleted } = useDisplaySettings();
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const today = new Date();

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const overdueTasks = visibleTasks.filter(isOverdue);
  const todayTasks = visibleTasks.filter(isDueToday);
  const allDayTasks = todayTasks.filter((t) => !t.dueDate || !hasDueTime(new Date(t.dueDate)));

  const tasksByDate = new Map([[format(today, "yyyy-MM-dd"), todayTasks]]);

  return (
    <div>
      <ScheduleGrid
        days={[today]}
        tasksByDate={tasksByDate}
        onSlotClick={(_day, start, end) => setSlot({ start, end })}
        header={
          <div className="flex gap-2 py-2">
            <div className="w-12 shrink-0 pt-0.5 text-xs text-muted-foreground">All day</div>
            <div className="min-w-0 flex-1 space-y-0.5">
              {overdueTasks.map((task) => (
                <AllDayRow key={task.id} task={task} />
              ))}
              {allDayTasks.map((task) => (
                <AllDayRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        }
      />

      <TaskComposer
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
        initialDueDate={slot?.start}
        initialStartTime={slot ? format(slot.start, "HH:mm") : undefined}
        initialEndTime={slot ? format(slot.end, "HH:mm") : undefined}
      />
    </div>
  );
}
