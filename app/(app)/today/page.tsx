import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { isDueToday, isOverdue } from "@/lib/task-dates";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TodayView } from "@/components/tasks/today-view";

export default async function TodayPage() {
  const userId = await requireUserId();
  const allTasks = await getTasksForUser(userId);
  const openTasks = allTasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter(isOverdue);
  const todayTasks = openTasks.filter(isDueToday);
  const tasks = [...overdueTasks, ...todayTasks];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Today</h1>
      <p className="mb-4 text-sm text-muted-foreground">{tasks.length} tasks</p>
      <div className="mb-6 max-w-xl">
        <TaskQuickAdd />
      </div>
      <ViewSwitcher
        tasks={tasks}
        listView={<TodayView overdueTasks={overdueTasks} todayTasks={todayTasks} />}
      />
    </div>
  );
}
