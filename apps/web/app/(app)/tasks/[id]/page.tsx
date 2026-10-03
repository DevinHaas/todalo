import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getOwnedTask } from "@/lib/tasks";
import { TaskDetailPage } from "@/components/tasks/task-detail-page";
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(); const { id } = await params;
  const task = await getOwnedTask(userId, id); if (!task) notFound();
  return <TaskDetailPage task={task} />;
}
