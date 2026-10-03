"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskComposer } from "@/components/tasks/task-composer";
import { EventRow } from "@/components/tasks/event-item";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { isDueToday, isOverdue } from "@/lib/task-dates";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function TodayView({ tasks, events = [] }: { tasks: Task[]; events?: CalendarEvent[] }) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const { showCompleted } = useDisplaySettings();
  const now = new Date();

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const overdueTasks = visibleTasks.filter(isOverdue);
  const todayTasks = visibleTasks.filter(isDueToday);
  const todayEvents = events.filter((e) => isToday(e.start));

  return (
    <div className="space-y-6">
      {overdueTasks.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setOverdueOpen((v) => !v)}
            className="mb-2 flex items-center gap-1 text-sm font-semibold"
          >
            <ChevronDown className={overdueOpen ? "size-4" : "-rotate-90 size-4"} />
            Overdue
            <span className="font-normal text-muted-foreground">{overdueTasks.length}</span>
          </button>
          {overdueOpen && overdueTasks.map((task) => <TaskRow key={task.id} task={task} />)}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          {format(now, "d MMM")} · Today · {format(now, "EEEE")}
        </h2>
        {todayEvents.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
        {todayTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        <TaskComposer defaultToToday />
      </section>
    </div>
  );
}
