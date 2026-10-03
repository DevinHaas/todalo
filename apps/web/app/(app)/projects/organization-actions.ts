"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { sections, tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { assertTaskOrganization } from "@todalo/db/task-organization";
import { assertTaskParent } from "@todalo/db/task-parent";
import { getProjectsForUser, getSectionsForUser } from "@/lib/organization";

const destination = z.object({ projectId: z.string().min(1).nullable(), sectionId: z.string().min(1).nullable() });
export async function getOrganizationDestinations() {
  const userId = await requireUserId();
  const [projects, sections] = await Promise.all([getProjectsForUser(userId), getSectionsForUser(userId)]);
  return { projects, sections };
}
export async function createSection(projectId: string, name: string) {
  const userId = await requireUserId();
  const parsed = z.object({ projectId: z.string().min(1), name: z.string().trim().min(1).max(200) }).parse({ projectId, name });
  await assertTaskOrganization({ userId, projectId: parsed.projectId, sectionId: null });
  const [section] = await db.insert(sections).values({ userId, ...parsed }).returning();
  revalidatePath("/", "layout");
  return section;
}
export async function deleteSection(id: string) {
  const userId = await requireUserId();
  await db.delete(sections).where(and(eq(sections.id, id), eq(sections.userId, userId)));
  revalidatePath("/", "layout");
}
export async function moveTasks(ids: string[], input: z.infer<typeof destination>) {
  const userId = await requireUserId();
  const targets = z.array(z.string().min(1)).min(1).max(200).parse([...new Set(ids)]);
  const data = destination.parse(input);
  await assertTaskOrganization({ userId, ...data });
  const owned = await db.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, targets)));
  if (owned.length !== targets.length) throw new Error("Task not found");
  // Moving a parent carries its children. Moving a child alone makes it a root.
  await db.update(tasks).set({ ...data }).where(and(eq(tasks.userId, userId), or(inArray(tasks.id, targets), inArray(tasks.parentId, targets))));
  const detached = owned.filter(task => task.parentId && !targets.includes(task.parentId)).map(task => task.id);
  if (detached.length) await db.update(tasks).set({ parentId: null }).where(and(eq(tasks.userId, userId), inArray(tasks.id, detached)));
  revalidatePath("/", "layout");
}
export async function setTaskParent(taskId: string, parentId: string | null) {
  const userId = await requireUserId();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  if (!task) throw new Error("Task not found");
  await assertTaskParent({ userId, taskId, parentId });
  const [parent] = parentId ? await db.select().from(tasks).where(and(eq(tasks.id, parentId), eq(tasks.userId, userId))).limit(1) : [];
  await db.update(tasks).set({ parentId, ...(parent ? { projectId: parent.projectId, sectionId: parent.sectionId } : {}) }).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  revalidatePath("/", "layout");
}
