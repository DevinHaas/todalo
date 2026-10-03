import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { projects, sections } from "./schema";
import { validateTaskOrganization, type OrganizationInput } from "./task-organization-validation";

export async function assertTaskOrganization(input: OrganizationInput): Promise<void> {
  const [project] = input.projectId ? await db.select({ id: projects.id, userId: projects.userId }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId))).limit(1) : [];
  const [section] = input.sectionId ? await db.select({ id: sections.id, userId: sections.userId, projectId: sections.projectId }).from(sections).where(and(eq(sections.id, input.sectionId), eq(sections.userId, input.userId))).limit(1) : [];
  validateTaskOrganization(input, project, section);
}
