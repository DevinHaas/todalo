import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { TaskQuickAdd } from "@/components/tasks/task-quick-add";
import { BoardView } from "@/components/tasks/board-view";

export default async function BoardPage() {
  const userId = await requireUserId();
  const tasks = await getTasksForUser(userId);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Board</h1>
      <div className="mb-6 max-w-xl">
        <TaskQuickAdd />
      </div>
      <BoardView tasks={tasks} />
    </div>
  );
}
