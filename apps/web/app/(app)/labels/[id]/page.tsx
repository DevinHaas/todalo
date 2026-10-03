import Link from "next/link";
import { notFound } from "next/navigation";
import { getMetadata } from "../../tasks/metadata-actions";
import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { ViewSwitcher } from "@/components/tasks/view-switcher";
export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(); const { id } = await params;
  const metadata = await getMetadata(); const label = metadata.labels.find(label => label.id === id);
  if (!label) notFound();
  const tasks = (await getTasksForUser(userId)).filter(task => task.labelIds.includes(id));
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">{label.name}</h1><Link href="/labels" className="text-sm underline">Manage labels</Link><ViewSwitcher tasks={tasks} /></div>;
}
