"use client";

import { useState } from "react";
import { LayoutGrid, CalendarDays, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListView } from "@/components/tasks/list-view";
import { BoardView } from "@/components/tasks/board-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import type { Task } from "@/lib/tasks";

const LAYOUTS = [
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

type Layout = (typeof LAYOUTS)[number]["key"];

export function ViewSwitcher({
  tasks,
  listView,
}: {
  tasks: Task[];
  listView?: React.ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>("list");

  return (
    <div>
      <div className="mb-4 flex justify-end gap-1 rounded-md border p-1">
        {LAYOUTS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={layout === key ? "secondary" : "ghost"}
            onClick={() => setLayout(key)}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </div>
      {layout === "list" && (listView ?? <ListView tasks={tasks} />)}
      {layout === "board" && <BoardView tasks={tasks} />}
      {layout === "calendar" && <CalendarView tasks={tasks} />}
    </div>
  );
}
