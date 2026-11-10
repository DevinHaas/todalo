// Server-only project operations shared by the legacy Next actions and /api/v1.
// Transports authenticate before supplying userId. Every write is scoped to the
// owner, so a foreign ID behaves exactly like a missing one.
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@todalo/db";
import { projects, tasks } from "@todalo/db/schema";
import type { ProjectCreateInput, ProjectUpdateInput } from "./project-dto";

export async function getProjectsForUser(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.name);
}

/** My Projects: every project (archived included) with its completed and open task counts. */
export async function getProjectSummaries(userId: string) {
  return db.select({
    ...getTableColumns(projects),
    completedCount: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')`.mapWith(Number),
    openCount: sql<number>`count(${tasks.id}) filter (where ${tasks.status} <> 'done')`.mapWith(Number),
  }).from(projects)
    .leftJoin(tasks, and(eq(tasks.projectId, projects.id), eq(tasks.userId, userId)))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(projects.name);
}

/** Returns null for missing and other users' projects alike. */
export async function getOwnedProject(userId: string, id: string) {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  return project ?? null;
}

export async function createProject(userId: string, input: { name: string; color?: string | null; favorite?: boolean } | ProjectCreateInput) {
  const [project] = await db.insert(projects).values({ userId, ...input }).returning();
  return project;
}

/** Only the supplied fields change; an omitted color is preserved. `archived` sets or clears archivedAt. */
export async function updateProject(userId: string, id: string, input: { name: string; color?: string } | ProjectUpdateInput) {
  const { archived, display, ...fields } = input as ProjectUpdateInput;
  const [project] = await db.update(projects).set({
    ...fields,
    ...archived === undefined ? {} : { archivedAt: archived ? new Date() : null },
    ...display === undefined ? {} : { viewSettings: display },
  }).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning();
  return project ?? null;
}

/** The schema keeps member tasks (tasks.project_id/section_id SET NULL, so they
 * move to Inbox) and cascades the project's sections. */
export async function deleteProject(userId: string, id: string) {
  const deleted = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).returning();
  return deleted.length > 0;
}
