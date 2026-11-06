"use client";
import { useEffect, useState } from "react";
// Temporary capture-only route (ticket 16): the legacy Upcoming/Today screens with
// the isolated QA API's fixture tasks (apps/client/scripts/auth-smoke-server.ts),
// relative to the browser's day, so legacy and shared-client captures match.
// Copy to apps/web/app/tauri-schedule-baseline/page.tsx, capture, then delete.
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DisplaySettingsProvider, DisplayMenu, LayoutSwitcher } from "@/components/tasks/display-settings";
import { SmartDateRecognitionProvider } from "@/components/settings/smart-date-recognition";
import { RambleProvider } from "@/components/ramble/ramble-provider";
import { KeyboardProvider } from "@/components/keyboard/keyboard-provider";
import { defaultPreferences } from "@/lib/keyboard";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TodayView } from "@/components/tasks/today-view";
import { TodayScheduleView } from "@/components/tasks/today-schedule-view";
import { UpcomingListView } from "@/components/tasks/upcoming-list-view";
import { CalendarView } from "@/components/tasks/calendar-view";
import type { Task } from "@/lib/tasks";

const day = (offset: number, hours = 0, minutes = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(hours, minutes, 0, 0); return date; };
function fixture(): Task[] {
  const base: Task = {
    id: "overdue-review", userId: "qa", projectId: null, parentId: null, sectionId: null, title: "Review the migration checklist",
    description: null, priority: 2, deadline: null, status: "todo", dueDate: day(-1, 12), dueDateEnd: null, recurrence: null,
    sortOrder: 0, googleCalendarEventId: null, completedAt: null, createdAt: day(-3), updatedAt: day(-3), labelIds: [],
  } as Task;
  return [
    base,
    { ...base, id: "shared-screen", title: "Plan the first shared screen", priority: 4, dueDate: day(0, 14, 30), deadline: day(3), projectId: "qa-work", labelIds: ["design"] },
    { ...base, id: "future", title: "Future fixture task", priority: 4, dueDate: day(2), projectId: "qa-work" },
    { ...base, id: "undated", title: "Undated fixture task", priority: 4, dueDate: null, projectId: "qa-work" },
    { ...base, id: "completed", title: "Completed fixture task", priority: 4, dueDate: day(0, 9), status: "done", completedAt: day(0, 9) },
    { ...base, id: "daily-standup", title: "Daily standup notes", priority: 4, dueDate: day(0, 9, 30), recurrence: { n: 1, unit: "day", basedOn: "scheduled" } } as Task,
  ];
}

export default function ScheduleBaselinePage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  useEffect(() => setTasks(fixture()), []);
  if (!tasks) return null;
  const upcoming = typeof location !== "undefined" && location.search.includes("upcoming");
  return <SmartDateRecognitionProvider initialEnabled={true}><RambleProvider projects={[]}>
    <SidebarProvider><KeyboardProvider initialPreferences={defaultPreferences()}>
      <AppSidebar user={{ name: "Development User", email: "existing@example.test", image: null }} todayCount={3} />
      <SidebarInset><DisplaySettingsProvider>
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex min-w-0 items-center gap-1"><SidebarTrigger className="size-11 md:hidden" /><LayoutSwitcher /></div>
          <DisplayMenu />
        </div>
        <main className="p-6">{upcoming ? <div>
          <h1 className="mb-4 text-2xl font-semibold">Upcoming</h1>
          <ViewSwitcher tasks={tasks} listView={<UpcomingListView tasks={tasks} />} calendarView={<CalendarView tasks={tasks} />} />
        </div> : <div>
          <h1 className="mb-1 text-2xl font-semibold">Today</h1>
          <p className="mb-4 text-sm text-muted-foreground">3 tasks</p>
          <ViewSwitcher tasks={tasks} listView={<TodayView tasks={tasks} />} calendarView={<TodayScheduleView tasks={tasks} />} />
        </div>}</main>
      </DisplaySettingsProvider></SidebarInset>
    </KeyboardProvider></SidebarProvider>
  </RambleProvider></SmartDateRecognitionProvider>;
}
