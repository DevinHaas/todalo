"use client";

import { ListView } from "@/components/tasks/list-view";
import { BoardView } from "@/components/tasks/board-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import { useDisplaySettings } from "@/components/tasks/display-settings";
import type { Task } from "@/lib/tasks";

export function ViewSwitcher({
  tasks,
  listView,
}: {
  tasks: Task[];
  listView?: React.ReactNode;
}) {
  const { layout } = useDisplaySettings();

  return (
    <div>
      {layout === "list" && (listView ?? <ListView tasks={tasks} />)}
      {layout === "board" && <BoardView tasks={tasks} />}
      {layout === "calendar" && <CalendarView tasks={tasks} />}
    </div>
  );
}
