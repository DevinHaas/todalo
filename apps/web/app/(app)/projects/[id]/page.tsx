import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getTasksForUser } from "@/lib/tasks";
import { getProjectForUser, getSectionsForUser } from "@/lib/organization";
import { ProjectView } from "@/components/organization/project-view";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId(); const { id } = await params;
  const project = await getProjectForUser(userId, id);
  if (!project) notFound();
  const [tasks, sections] = await Promise.all([getTasksForUser(userId, id), getSectionsForUser(userId, id)]);
  return <ProjectView project={project} tasks={tasks} sections={sections} />;
}
