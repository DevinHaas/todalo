"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { format, isToday, setHours } from "date-fns";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import { hasDueTime } from "@/lib/task-dates";
import { completeTask, deleteTask } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks";

export const HOUR_HEIGHT = 48; // px per hour
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const DEFAULT_DURATION_MINUTES = 30;
export const CLICK_SLOT_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;
const LABEL_COLUMN_WIDTH = "3rem";

export function offsetFor(date: Date) {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

// Inverse of offsetFor: pixel offset within the grid -> minutes since
// midnight, snapped to the nearest slot.
export function minutesForOffset(y: number) {
  const rawMinutes = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(rawMinutes / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES;
  return Math.min(Math.max(snapped, 0), MINUTES_PER_DAY - CLICK_SLOT_MINUTES);
}

// Single column template shared by every row (day header, all-day, hour
// lines, day columns, current-time line) so their column edges land on
// identical pixels instead of drifting across independently-computed grids.
export function scheduleGridTemplate(days: Date[]): React.CSSProperties {
  return { gridTemplateColumns: `${LABEL_COLUMN_WIDTH} repeat(${days.length}, minmax(0, 1fr))` };
}

function CurrentTimeLine({ days }: { days: Date[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute inset-x-0 z-10 grid items-center"
      style={{ top: offsetFor(now), ...scheduleGridTemplate(days) }}
    >
      <span className="whitespace-nowrap pr-1 text-right text-xs font-medium text-destructive">
        {format(now, "HH:mm")}
      </span>
      {days.map((day) => (
        <span key={day.toISOString()} className="relative flex items-center">
          {isToday(day) && <span className="absolute -left-0.5 size-1.5 rounded-full bg-destructive" />}
          <span className={isToday(day) ? "h-[3px] w-full bg-destructive" : "h-px w-full bg-destructive/40"} />
        </span>
      ))}
    </div>
  );
}

export function TimedTaskBlock({ task }: { task: Task }) {
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
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-1 z-0 overflow-hidden rounded-md bg-accent px-2 py-1 text-left"
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

export function AllDayRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="group flex items-center gap-1.5 rounded bg-muted/50 px-1.5 py-0.5">
      <Checkbox
        className="size-3.5 rounded-full"
        checked={task.status === "done"}
        disabled={isPending}
        onCheckedChange={() => startTransition(() => completeTask(task.id))}
      />
      <TaskEditDialog task={task}>
        <button
          type="button"
          className={
            task.status === "done"
              ? "flex-1 text-left text-xs font-medium text-muted-foreground line-through"
              : "flex-1 text-left text-xs font-medium"
          }
        >
          {task.title}
        </button>
      </TaskEditDialog>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isPending}
        className="size-5 opacity-0 group-hover:opacity-100"
        onClick={() => startTransition(() => deleteTask(task.id))}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

export function ScheduleGrid({
  days,
  tasksByDate,
  onSlotClick,
  header,
}: {
  days: Date[];
  tasksByDate: Map<string, Task[]>;
  onSlotClick: (day: Date, start: Date, end: Date) => void;
  header?: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(600);

  // Fill the viewport below the grid's top instead of a fixed height, so the
  // calendar uses all the vertical space the page actually has available.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    function updateHeight() {
      const top = container!.getBoundingClientRect().top;
      setGridHeight(Math.max(window.innerHeight - top - 24, 300));
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Center on "now" once, the first time we know the real (measured) height —
  // re-running this on every resize would fight the user's own scrolling.
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    const visibleHeight = container.clientHeight - (headerRef.current?.offsetHeight ?? 0);
    const offset = offsetFor(new Date());
    container.scrollTop = Math.max(offset - visibleHeight / 2, 0);
  }, [gridHeight]);

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const startMinutes = minutesForOffset(e.clientY - rect.top);
    const start = new Date(day);
    start.setHours(0, startMinutes, 0, 0);
    const end = new Date(start.getTime() + CLICK_SLOT_MINUTES * 60_000);
    onSlotClick(day, start, end);
  }

  const gridTemplate = scheduleGridTemplate(days);

  return (
    <div ref={scrollRef} className="relative overflow-y-auto" style={{ height: gridHeight }}>
      {header && (
        <div ref={headerRef} className="sticky top-0 z-20 border-b bg-background">
          {header}
        </div>
      )}
      <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="absolute inset-x-0 grid items-center"
            style={{ top: hour * HOUR_HEIGHT, ...gridTemplate }}
          >
            <span className="pr-1 text-right text-xs text-muted-foreground">
              {format(setHours(new Date(), hour), "HH:00")}
            </span>
            {days.map((day) => (
              <span key={day.toISOString()} className="h-px bg-border" />
            ))}
          </div>
        ))}

        {/* ponytail: no per-hour collision layout (side-by-side overlap
            handling) — tasks are assumed non-overlapping for now; add
            column layout if overlapping timed tasks become common. */}
        <div className="absolute inset-0 grid" style={gridTemplate}>
          <div />
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const timedTasks = (tasksByDate.get(key) ?? []).filter(
              (t) => t.dueDate && hasDueTime(new Date(t.dueDate))
            );
            return (
              <div
                key={key}
                className="relative border-l first:border-l-0"
                onClick={(e) => handleColumnClick(day, e)}
              >
                {timedTasks.map((task) => (
                  <TimedTaskBlock key={task.id} task={task} />
                ))}
              </div>
            );
          })}
        </div>

        <CurrentTimeLine days={days} />
      </div>
    </div>
  );
}
