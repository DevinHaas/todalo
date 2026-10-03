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
  parseISO,
} from "date-fns";
import { ChevronDown } from "lucide-react";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskComposer } from "@/components/tasks/task-composer";
import { EventRow } from "@/components/tasks/event-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import { isOverdue } from "@/lib/task-dates";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";
import { taskTreeOrder } from "@/lib/task-keyboard";
import { useKeyboardCommands, ShortcutHint } from "@/components/keyboard/keyboard-provider";
import { navigateViewDate, type ViewDateAction } from "@/lib/view-navigation";
import { Button } from "@/components/ui/button";

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

export function UpcomingListView({ tasks, events = [] }: { tasks: Task[]; events?: CalendarEvent[] }) {
  const [overdueOpen, setOverdueOpen] = useState(true);
  const { showCompleted } = useDisplaySettings();
  const today = startOfToday();
  const [activeDay, setActiveDay] = useState(dayKey(today));
  const activeDate = parseISO(activeDay);
  const weekStart = startOfWeek(activeDate, { weekStartsOn: 1 });
  const [windowStart, setWindowStart] = useState(() => startOfWeek(today, { weekStartsOn: 1 }));
  const [windowEnd, setWindowEnd] = useState(() => addYears(today, 1));
  const daysShown = differenceInCalendarDays(windowEnd, windowStart) + 1;
  const days = Array.from({ length: daysShown }, (_, i) => addDays(windowStart, i));

  const visibleTasks = showCompleted ? tasks : tasks.filter((t) => t.status !== "done");
  const overdueTasks = visibleTasks.filter(task => isOverdue(task) && task.dueDate && new Date(task.dueDate) < windowStart);
  const laterTasks = visibleTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) > windowEnd && !isSameDay(new Date(t.dueDate), windowEnd),
  );

  const listRef = useRef<HTMLDivElement>(null);

  // The strip shows a fixed 7-day week rather than scrolling: it just swaps
  // to the week containing whichever day is active.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  function goToDay(day: Date) {
    const key = dayKey(day);
    if (day < windowStart) setWindowStart(startOfWeek(day, { weekStartsOn: 1 }));
    if (day > windowEnd) setWindowEnd(addDays(startOfWeek(day, { weekStartsOn: 1 }), 6));
    setActiveDay(key);
    requestAnimationFrame(() => {
      const container = listRef.current;
      const section = container?.querySelector<HTMLElement>(`section[id="${key}"]`);
      if (container && section) container.scrollTo({ top: container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top });
    });
  }
  function navigate(action: ViewDateAction) { goToDay(navigateViewDate(activeDate, action)); }
  useKeyboardCommands({ "upcoming.today": () => navigate("today"), "upcoming.next-week": () => navigate("next-week"), "upcoming.previous-week": () => navigate("previous-week") });

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

    const todaySection = container.querySelector<HTMLElement>(`section[id="${dayKey(startOfToday())}"]`);
    if (todaySection) container.scrollTop += todaySection.getBoundingClientRect().top - container.getBoundingClientRect().top;
    updateActiveDay();
    container.addEventListener("scroll", updateActiveDay, { passive: true });
    return () => container.removeEventListener("scroll", updateActiveDay);
  }, []);

  return (
    <div>
      <div className="mx-auto mb-2 flex max-w-2xl flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate("previous-week")}>Previous week <ShortcutHint commandId="upcoming.previous-week" /></Button>
        <Button size="sm" variant="outline" onClick={() => navigate("today")}>Today <ShortcutHint commandId="upcoming.today" /></Button>
        <Button size="sm" variant="ghost" onClick={() => navigate("next-week")}>Next week <ShortcutHint commandId="upcoming.next-week" /></Button>
      </div>
      <div className="mx-auto mb-4 flex max-w-2xl gap-1 border-b pb-2">
        {weekDays.map((day) => (
          <a
            key={dayKey(day)}
            href={`#${dayKey(day)}`}
            onClick={event => { event.preventDefault(); goToDay(day); }}
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
            {overdueOpen && taskTreeOrder(overdueTasks).map((task) => <TaskRow key={task.id} task={task} />)}
          </section>
        )}

        {days.map((day) => {
          const dayTasks = visibleTasks.filter((t) => t.dueDate && isSameDay(new Date(t.dueDate), day));
          const dayEvents = events.filter((e) => isSameDay(e.start, day));
          return (
            <section key={dayKey(day)} id={dayKey(day)} className="scroll-mt-4">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{dayLabel(day)}</h2>
              {dayEvents.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
              {taskTreeOrder(dayTasks).map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
              <TaskComposer initialDueDate={day} />
            </section>
          );
        })}

        {laterTasks.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Later</h2>
            {taskTreeOrder(laterTasks).map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </section>
        )}
        </div>
      </ScrollArea>
    </div>
  );
}
