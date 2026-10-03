"use client";

import { ListView } from "@/components/tasks/list-view";
import { BoardView } from "@/components/tasks/board-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import type { Task } from "@/lib/tasks";
import type { CalendarEvent } from "@/lib/calendar-events";

export function ViewSwitcher({
  tasks,
  events = [],
  listView,
  calendarView,
}: {
  tasks: Task[];
  events?: CalendarEvent[];
  listView?: React.ReactNode;
  calendarView?: React.ReactNode;
}) {
  const { layout } = useDisplaySettings();

  return (
    <div>
      {layout === "list" && (listView ?? <ListView tasks={tasks} events={events} />)}
      {layout === "board" && <BoardView tasks={tasks} />}
      {layout === "calendar" && (calendarView ?? <CalendarView tasks={tasks} events={events} />)}
    </div>
  );
}
