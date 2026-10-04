"use client";

import { useRef, useState } from "react";
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
} from "date-fns";
import { Button } from "@/components/ui/button";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import { WeekScheduleView } from "@/components/tasks/week-schedule-view";
import { EventChip } from "@/components/tasks/event-item";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";
import { useKeyboardCommands } from "@/components/keyboard/keyboard-provider";
import { navigateViewDate, type ViewDateAction } from "@/lib/view-navigation";
import { useTaskKeyboard } from "./task-keyboard-provider";

export function CalendarView({ tasks, events = [], projectId }: { tasks: Task[]; events?: CalendarEvent[]; projectId?: string }) {
  const { calendarRange } = useDisplaySettings();
  const [anchor, setAnchor] = useState(() => new Date());
  const root = useRef<HTMLDivElement>(null);
  function navigate(action: ViewDateAction) {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAnchor(current => navigateViewDate(current, action));
    requestAnimationFrame(() => { if (opener && !opener.isConnected) root.current?.focus(); });
  }
  useKeyboardCommands({ "calendar.today": () => navigate("today"), "calendar.next-week": () => navigate("next-week"), "calendar.previous-week": () => navigate("previous-week") });
  return <div ref={root} tabIndex={-1} aria-label="Calendar view" className="outline-none">{calendarRange === "week" ? (
    <WeekScheduleView tasks={tasks} events={events} anchor={anchor} onNavigate={navigate} projectId={projectId} />
  ) : (
    <MonthView tasks={tasks} events={events} month={anchor} setMonth={setAnchor} onNavigate={navigate} />
  )}</div>;
}

function MonthView({ tasks, events, month, setMonth, onNavigate }: { tasks: Task[]; events: CalendarEvent[]; month: Date; setMonth: React.Dispatch<React.SetStateAction<Date>>; onNavigate: (action: ViewDateAction) => void }) {
  const { showCompleted } = useDisplaySettings();
  const keyboard = useTaskKeyboard();

  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!showCompleted && task.status === "done") continue;
    if (!task.dueDate) continue;
    const key = format(new Date(task.dueDate), "yyyy-MM-dd");
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = format(event.start, "yyyy-MM-dd");
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }

  function goPrev() {
    setMonth((m) => subMonths(m, 1));
  }

  function goNext() {
    setMonth((m) => addMonths(m, 1));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goPrev}>
          Prev
        </Button>
        <div className="text-center"><h2 className="text-lg font-medium" aria-live="polite">{format(month, "MMMM yyyy")}</h2><span className="text-xs text-muted-foreground">Week of {format(startOfWeek(month, { weekStartsOn: 1 }), "MMM d")}</span></div>
        <Button variant="outline" size="sm" onClick={goNext}>
          Next
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => onNavigate("previous-week")}>Previous week</Button>
        <Button variant="outline" size="sm" onClick={() => onNavigate("today")}>Today</Button>
        <Button variant="ghost" size="sm" onClick={() => onNavigate("next-week")}>Next week</Button>
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
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={
                "min-h-24 bg-background p-1 " + (isSameMonth(day, month) ? "" : "opacity-40") + (day >= startOfWeek(month, { weekStartsOn: 1 }) && day <= endOfWeek(month, { weekStartsOn: 1 }) ? " ring-1 ring-inset ring-primary/30" : "")
              }
            >
              <div className={isToday(day) ? "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground" : "mb-1 text-xs"}>
                {format(day, "d")}
              </div>
              {dayEvents.map((event) => (
                <EventChip key={event.id} event={event} />
              ))}
              {dayTasks.map((task) => (
                <TaskEditDialog key={task.id} task={task}>
                  <button
                    type="button"
                    data-task-id={task.id}
                    onFocus={() => keyboard?.focus(task.id)}
                    className="mb-1 block w-full truncate rounded bg-accent px-1 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring"
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
