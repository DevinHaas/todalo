import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { getCalendarEventsForUser } from "@/lib/calendar-events";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { UpcomingListView } from "@/components/tasks/upcoming-list-view";
import { CalendarView } from "@/components/tasks/calendar-view";

export default async function UpcomingPage() {
  const userId = await requireUserId();
  const [allTasks, events] = await Promise.all([
    getTasksForUser(userId),
    getCalendarEventsForUser(userId),
  ]);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Upcoming</h1>
      <ViewSwitcher
        tasks={allTasks}
        events={events}
        listView={<UpcomingListView tasks={allTasks} events={events} />}
        calendarView={<CalendarView tasks={allTasks} events={events} />}
      />
    </div>
  );
}
