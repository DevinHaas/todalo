import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { ViewSwitcher } from "@/components/tasks/view-switcher";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.slice(0, 200) ?? "";
  const tasks = (await getTasksForUser(await requireUserId())).filter(task => `${task.title} ${task.description ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Search</h1><form className="flex gap-3"><input className="rounded border p-2" aria-label="Search tasks" name="q" defaultValue={query} placeholder="Search tasks" /><button className="rounded border px-4">Search</button></form><p className="text-sm text-muted-foreground">{tasks.length} results</p><ViewSwitcher tasks={tasks} /></div>;
}
