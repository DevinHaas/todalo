import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { isDueTodayOrOverdue } from "@/lib/task-dates";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { ViewSwitcher } from "@/components/tasks/view-switcher";

export default async function UpcomingPage() {
  const userId = await requireUserId();
  const allTasks = await getTasksForUser(userId);
  const tasks = allTasks.filter((t) => !isDueTodayOrOverdue(t));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Upcoming</h1>
      <div className="mb-6 max-w-xl">
        <TaskQuickAdd />
      </div>
      <ViewSwitcher tasks={tasks} />
    </div>
  );
}
