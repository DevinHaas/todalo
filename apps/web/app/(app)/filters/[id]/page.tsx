import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetadata } from "../../tasks/metadata-actions";
import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { matchesSavedFilter } from "@/lib/task-metadata";
import { runFilterQuery } from "@todalo/server/filter-query";
import { getProjectsForUser } from "@todalo/server/projects";
import { getSectionsForUser } from "@todalo/server/organization";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
export default async function FilterPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(); const { id } = await params;
  const metadata = await getMetadata(); const filter = metadata.filters.find(filter => filter.id === id);
  if (!filter) notFound();
  const all = await getTasksForUser(userId);
  let tasks = filter.definition ? all.filter(task => matchesSavedFilter(task, filter.definition!)) : [];
  if (filter.query) {
    // A query filter saved by the new client: its lists, shown here as one.
    const [projects, sections] = await Promise.all([getProjectsForUser(userId), getSectionsForUser(userId)]);
    const matched = new Set(runFilterQuery(filter.query, all, { now: new Date(), labels: metadata.labels, projects, sections }).flatMap(group => group.tasks));
    tasks = all.filter(task => matched.has(task));
  }
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">{filter.name}</h1><Link href="/filters" className="text-sm underline">Manage filters</Link><ViewSwitcher tasks={tasks} /></div>;
}
