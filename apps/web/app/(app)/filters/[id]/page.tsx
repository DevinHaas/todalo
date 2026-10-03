import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetadata } from "../../tasks/metadata-actions";
import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { matchesSavedFilter } from "@/lib/task-metadata";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
export default async function FilterPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(); const { id } = await params;
  const metadata = await getMetadata(); const filter = metadata.filters.find(filter => filter.id === id);
  if (!filter) notFound();
  const tasks = (await getTasksForUser(userId)).filter(task => matchesSavedFilter(task, filter.definition));
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">{filter.name}</h1><Link href="/filters" className="text-sm underline">Manage filters</Link><ViewSwitcher tasks={tasks} /></div>;
}
