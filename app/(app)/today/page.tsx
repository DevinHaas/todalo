import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { isDueTodayOrOverdue } from "@/lib/task-dates";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
import { TodayView } from "@/components/tasks/today-view";

export default async function TodayPage() {
  const userId = await requireUserId();
  const allTasks = await getTasksForUser(userId);
  const openCount = allTasks.filter((t) => t.status !== "done" && isDueTodayOrOverdue(t)).length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Today</h1>
      <p className="mb-4 text-sm text-muted-foreground">{openCount} tasks</p>
      <ViewSwitcher tasks={allTasks} listView={<TodayView tasks={allTasks} />} />
    </div>
  );
}
