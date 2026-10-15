import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sections } from "@/db/schema";
import { getOwnedProject } from "@todalo/server/projects";

export { getProjectsForUser } from "@todalo/server/projects";
export async function getProjectForUser(userId: string, id: string) {
  return (await getOwnedProject(userId, id)) ?? undefined;
}
export async function getSectionsForUser(userId: string, projectId?: string) {
  return db.select().from(sections).where(projectId ? and(eq(sections.userId, userId), eq(sections.projectId, projectId)) : eq(sections.userId, userId)).orderBy(sections.sortOrder, sections.name);
}
