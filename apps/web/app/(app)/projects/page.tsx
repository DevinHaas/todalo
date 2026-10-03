import { requireUserId } from "@/lib/auth";
import { getProjectsForUser } from "@/lib/organization";
import { ProjectDirectory } from "@/components/organization/project-directory";

export default async function ProjectsPage() {
  const projects = await getProjectsForUser(await requireUserId());
  return <><h1 className="mb-6 text-2xl font-semibold">Projects</h1><ProjectDirectory projects={projects} /></>;
}
