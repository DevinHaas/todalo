"use client";

import { ListView } from "@/components/tasks/list-view";
import { BoardView } from "@/components/tasks/board-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";
import { TaskKeyboardProvider } from "./task-keyboard-provider";
import { useKeyboardCommands } from "@/components/keyboard/keyboard-provider";
import { nextLayout } from "@/lib/view-navigation";

export function ViewSwitcher({
  tasks,
  events = [],
  listView,
  calendarView,
  projectId,
}: {
  tasks: Task[];
  events?: CalendarEvent[];
  listView?: React.ReactNode;
  calendarView?: React.ReactNode;
  projectId?: string;
}) {
  const { layout, setLayout } = useDisplaySettings();
  useKeyboardCommands({ "view.layout": () => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLayout(nextLayout(layout));
    requestAnimationFrame(() => {
      if (opener && !opener.isConnected) document.querySelector<HTMLElement>('[aria-label="Task collection"]')?.focus();
    });
  } });

  return (
    <TaskKeyboardProvider tasks={tasks} projectId={projectId}>
      {layout === "list" && (listView ?? <ListView tasks={tasks} events={events} />)}
      {layout === "board" && <BoardView tasks={tasks} />}
      {layout === "calendar" && (calendarView ?? <CalendarView tasks={tasks} events={events} projectId={projectId} />)}
    </TaskKeyboardProvider>
  );
}
