import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { ListView } from "@/components/tasks/list-view";

export default async function ListPage() {
  const userId = await requireUserId();
  const tasks = await getTasksForUser(userId);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">List</h1>
      <TaskQuickAdd />
      <div className="mt-6">
        <ListView tasks={tasks} />
      </div>
    </div>
  );
}
