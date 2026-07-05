import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { TaskRow } from "@/components/tasks/task-row";

export default async function TodayPage() {
  const userId = await requireUserId();
  const tasks = await getTasksForUser(userId);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Today</h1>
      <TaskQuickAdd />
      <div className="mt-4">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
