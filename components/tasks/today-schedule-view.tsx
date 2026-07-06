"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { format, setHours } from "date-fns";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TaskComposer } from "@/components/tasks/task-composer";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { isDueToday, isOverdue, hasDueTime } from "@/lib/task-dates";
import { completeTask, deleteTask } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks";

const HOUR_HEIGHT = 48; // px per hour
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_DURATION_MINUTES = 30;

function offsetFor(date: Date) {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

function CurrentTimeLine() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-x-0 z-10 flex items-center gap-1" style={{ top: offsetFor(now) }}>
      <span className="w-12 shrink-0 whitespace-nowrap text-right text-xs font-medium text-destructive">
        {format(now, "HH:mm")}
      </span>
      <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
      <span className="h-px flex-1 bg-destructive/60" />
    </div>
  );
}

function TimedTaskBlock({ task }: { task: Task }) {
  const start = new Date(task.dueDate!);
  const end = task.dueDateEnd
    ? new Date(task.dueDateEnd)
    : new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
  const top = offsetFor(start);
  const height = Math.max(offsetFor(end) - top, 20);

  return (
    <TaskEditDialog task={task}>
      <button
        type="button"
        className="absolute left-14 right-2 z-0 overflow-hidden rounded-md bg-accent px-2 py-1 text-left"
        style={{ top, height }}
      >
        <div className="truncate text-sm font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {format(start, "HH:mm")}–{format(end, "HH:mm")}
        </div>
      </button>
    </TaskEditDialog>
  );
}

function AllDayRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="group flex items-center gap-3 rounded-md bg-muted/50 px-3 py-1.5">
      <Checkbox
        className="rounded-full"
        checked={task.status === "done"}
        disabled={isPending}
        onCheckedChange={() => startTransition(() => completeTask(task.id))}
      />
      <TaskEditDialog task={task}>
        <button
          type="button"
          className={
            task.status === "done"
              ? "flex-1 text-left text-sm font-semibold text-muted-foreground line-through"
              : "flex-1 text-left text-sm font-semibold"
          }
        >
          {task.title}
        </button>
      </TaskEditDialog>
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

export function TodayScheduleView({ tasks }: { tasks: Task[] }) {
  const { showCompleted } = useDisplaySettings();
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const overdueTasks = visibleTasks.filter(isOverdue);
  const todayTasks = visibleTasks.filter(isDueToday);
  const allDayTasks = todayTasks.filter((t) => !t.dueDate || !hasDueTime(new Date(t.dueDate)));
  const timedTasks = todayTasks.filter((t) => t.dueDate && hasDueTime(new Date(t.dueDate)));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const offset = offsetFor(new Date());
    container.scrollTop = Math.max(offset - container.clientHeight / 2, 0);
  }, []);

  return (
    <div>
      <section className="mb-2 flex gap-2">
        <div className="w-12 shrink-0 pt-1.5 text-xs text-muted-foreground">All day</div>
        <div className="min-w-0 flex-1 space-y-px">
          {overdueTasks.map((task) => (
            <AllDayRow key={task.id} task={task} />
          ))}
          {allDayTasks.map((task) => (
            <AllDayRow key={task.id} task={task} />
          ))}
          <TaskComposer defaultToToday />
        </div>
      </section>

      <div ref={scrollRef} className="relative h-[600px] overflow-y-auto border-t">
        <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute inset-x-0 flex items-center gap-1"
              style={{ top: hour * HOUR_HEIGHT }}
            >
              <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
                {format(setHours(new Date(), hour), "HH:00")}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ))}

          {/* ponytail: no per-hour collision layout (side-by-side overlap
              handling) — tasks are assumed non-overlapping for now; add
              column layout if overlapping timed tasks become common. */}
          {timedTasks.map((task) => (
            <TimedTaskBlock key={task.id} task={task} />
          ))}

          <CurrentTimeLine />
        </div>
      </div>
    </div>
  );
}
