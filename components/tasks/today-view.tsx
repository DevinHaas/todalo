"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { TaskRow } from "@/components/tasks/task-row";
import type { Task } from "@/lib/tasks";

export function TodayView({
  overdueTasks,
  todayTasks,
}: {
  overdueTasks: Task[];
  todayTasks: Task[];
}) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const now = new Date();

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

      {todayTasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            {format(now, "d MMM")} · Today · {format(now, "EEEE")}
          </h2>
          {todayTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </section>
      )}
    </div>
  );
}
