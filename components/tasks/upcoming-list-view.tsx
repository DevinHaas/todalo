"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addYears,
  differenceInCalendarDays,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import { ChevronDown } from "lucide-react";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskComposer } from "@/components/tasks/task-composer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { isOverdue } from "@/lib/task-dates";
import type { Task } from "@/lib/tasks";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function dayLabel(date: Date) {
  const base = format(date, "d MMM");
  const weekday = format(date, "EEEE");
  if (isToday(date)) return `${base} · Today · ${weekday}`;
  if (isSameDay(date, addDays(startOfToday(), 1))) return `${base} · Tomorrow · ${weekday}`;
  return `${base} · ${weekday}`;
}

export function UpcomingListView({ tasks }: { tasks: Task[] }) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const { showCompleted } = useDisplaySettings();
  const today = startOfToday();
  const windowEnd = addYears(today, 1);
  const daysShown = differenceInCalendarDays(windowEnd, today) + 1;
  const days = Array.from({ length: daysShown }, (_, i) => addDays(today, i));

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const overdueTasks = visibleTasks.filter(isOverdue);
  const laterTasks = visibleTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) > windowEnd && !isSameDay(new Date(t.dueDate), windowEnd),
  );

  const listRef = useRef<HTMLDivElement>(null);
  const [activeDay, setActiveDay] = useState(dayKey(today));

  // The strip shows a fixed 7-day week rather than scrolling: it just swaps
  // to the week containing whichever day is active.
  const activeDate = days.find((d) => dayKey(d) === activeDay) ?? today;
  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Scroll-spy: highlight whichever day section is topmost in the scroll
  // container, so the strip stays in sync with manual scrolling too.
  // Computed by geometry (not IntersectionObserver bands) so short/empty
  // day sections can't get skipped between observer callbacks.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const updateActiveDay = () => {
      const sections = container.querySelectorAll("section[id]");
      const containerTop = container.getBoundingClientRect().top;
      let current: Element | null = null;
      for (const section of sections) {
        if (section.getBoundingClientRect().top - containerTop <= 1) {
          current = section;
        } else {
          break;
        }
      }
      if (current) setActiveDay(current.id);
    };

    updateActiveDay();
    container.addEventListener("scroll", updateActiveDay, { passive: true });
    return () => container.removeEventListener("scroll", updateActiveDay);
  }, []);

  return (
    <div>
      {/* ponytail: fixed 7-day strip that swaps to the active week, no
          prev/next chrome — add if users want to jump weeks manually. */}
      <div className="mx-auto mb-4 flex max-w-2xl gap-1 border-b pb-2">
        {weekDays.map((day) => (
          <a
            key={dayKey(day)}
            href={`#${dayKey(day)}`}
            onClick={() => setActiveDay(dayKey(day))}
            className={
              "flex flex-1 flex-col items-center rounded-md px-3 py-1 text-xs " +
              (dayKey(day) === activeDay
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:bg-muted")
            }
          >
            <span>{format(day, "EEE")}</span>
            <span>{format(day, "d")}</span>
          </a>
        ))}
      </div>

      <ScrollArea
        viewportRef={listRef}
        className="mx-auto h-[calc(100vh-14rem)] max-w-2xl"
      >
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

        {days.map((day) => {
          const dayTasks = visibleTasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));
          return (
            <section key={dayKey(day)} id={dayKey(day)} className="scroll-mt-4">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{dayLabel(day)}</h2>
              {dayTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              <TaskComposer initialDueDate={day} />
            </section>
          );
        })}

        {laterTasks.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Later</h2>
            {laterTasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </section>
        )}
        </div>
      </ScrollArea>
    </div>
  );
}
