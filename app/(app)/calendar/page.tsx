import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { CalendarView } from "@/components/tasks/calendar-view";

export default async function CalendarPage() {
  const userId = await requireUserId();
  const tasks = await getTasksForUser(userId);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Calendar</h1>
      <div className="mb-6 max-w-xl">
        <TaskQuickAdd />
      </div>
      <CalendarView tasks={tasks} />
    </div>
  );
}
