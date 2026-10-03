import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, sections } from "@/db/schema";

export async function getProjectsForUser(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.name);
}
export async function getProjectForUser(userId: string, id: string) {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  return project;
}
export async function getSectionsForUser(userId: string, projectId?: string) {
  return db.select().from(sections).where(projectId ? and(eq(sections.userId, userId), eq(sections.projectId, projectId)) : eq(sections.userId, userId)).orderBy(sections.sortOrder, sections.name);
}
