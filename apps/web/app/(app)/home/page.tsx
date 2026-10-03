import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { getProjectsForUser } from "@/lib/organization";
import { ViewSwitcher } from "@/components/tasks/view-switcher";

export default async function HomePage() {
  const userId = await requireUserId();
  const [tasks, projects] = await Promise.all([getTasksForUser(userId), getProjectsForUser(userId)]);
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Home</h1><nav className="flex flex-wrap gap-4"><Link className="underline" href="/inbox">Inbox</Link><Link className="underline" href="/today">Today</Link><Link className="underline" href="/upcoming">Upcoming</Link>{projects.map(project => <Link className="underline" href={`/projects/${project.id}`} key={project.id}>{project.name}</Link>)}</nav><ViewSwitcher tasks={tasks} /></div>;
}
