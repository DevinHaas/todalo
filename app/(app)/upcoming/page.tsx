import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { UpcomingListView } from "@/components/tasks/upcoming-list-view";
import { CalendarView } from "@/components/tasks/calendar-view";

export default async function UpcomingPage() {
  const userId = await requireUserId();
  const allTasks = await getTasksForUser(userId);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Upcoming</h1>
      <ViewSwitcher
        tasks={allTasks}
        listView={<UpcomingListView tasks={allTasks} />}
        calendarView={<CalendarView tasks={allTasks} />}
      />
    </div>
  );
}
