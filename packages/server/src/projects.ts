// Server-only project operations shared by the legacy Next actions and /api/v1.
// Transports authenticate before supplying userId. Every write is scoped to the
// owner, so a foreign ID behaves exactly like a missing one.
import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { projects } from "@todalo/db/schema";

export async function getProjectsForUser(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.name);
}

/** Returns null for missing and other users' projects alike. */
export async function getOwnedProject(userId: string, id: string) {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  return project ?? null;
}

export async function createProject(userId: string, input: { name: string; color?: string }) {
  const [project] = await db.insert(projects).values({ userId, ...input }).returning();
  return project;
}

/** Only the supplied fields change; an omitted color is preserved. */
export async function updateProject(userId: string, id: string, input: { name: string; color?: string }) {
  const [project] = await db.update(projects).set(input).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning();
  return project ?? null;
}

/** The schema keeps member tasks (tasks.project_id/section_id SET NULL, so they
 * move to Inbox) and cascades the project's sections. */
export async function deleteProject(userId: string, id: string) {
  const deleted = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning();
  return deleted.length > 0;
}
