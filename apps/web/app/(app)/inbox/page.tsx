import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { ViewSwitcher } from "@/components/tasks/view-switcher";

export default async function InboxPage() {
  const tasks = (await getTasksForUser(await requireUserId())).filter(task => task.projectId === null);
  return <><h1 className="mb-6 text-2xl font-semibold">Inbox</h1><ViewSwitcher tasks={tasks} /></>;
}
