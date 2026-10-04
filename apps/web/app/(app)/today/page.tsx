import { requireUserId } from "@/lib/auth";
import { getTodayTasksForUser } from "@/lib/tasks";
import { getCalendarEventsForUser } from "@/lib/calendar-events";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TodayView } from "@/components/tasks/today-view";
import { TodayScheduleView } from "@/components/tasks/today-schedule-view";

export default async function TodayPage() {
  const userId = await requireUserId();
  const [{ tasks: allTasks, openCount }, events] = await Promise.all([
    getTodayTasksForUser(userId),
    getCalendarEventsForUser(userId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Today</h1>
      <p className="mb-4 text-sm text-muted-foreground">{openCount} tasks</p>
      <ViewSwitcher
        tasks={allTasks}
        events={events}
        listView={<TodayView key="today-list" tasks={allTasks} events={events} />}
        calendarView={<TodayScheduleView key="today-calendar" tasks={allTasks} events={events} />}
      />
    </div>
  );
}
