"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { labels, savedFilters, projects, tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { assertOwnedLabels, replaceTaskLabels } from "@/lib/task-labels";
import { taskMetadataSchema, filterDefinitionSchema } from "@/lib/task-metadata";
import { taskLabels } from "@/db/schema";

export async function getTaskEditorData(id: string) {
  const userId = await requireUserId();
  const [task] = await db.select({ id: tasks.id, title: tasks.title, description: tasks.description, priority: tasks.priority, deadline: tasks.deadline, dueDate: tasks.dueDate, dueDateEnd: tasks.dueDateEnd, recurrence: tasks.recurrence }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!task) throw new Error("Task not found");
  const links = await db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(and(eq(taskLabels.taskId, id), eq(taskLabels.userId, userId)));
  return { ...task, labelIds: links.map(link => link.labelId) };
}

const labelInput = z.object({ name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() });
export async function getMetadata() {
  const userId = await requireUserId();
  const [userLabels, filters, userProjects] = await Promise.all([
    db.select({ id: labels.id, name: labels.name, color: labels.color }).from(labels).where(eq(labels.userId, userId)).orderBy(labels.name),
    db.select({ id: savedFilters.id, name: savedFilters.name, definition: savedFilters.definition }).from(savedFilters).where(eq(savedFilters.userId, userId)).orderBy(savedFilters.name),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
  ]);
  return { labels: userLabels, filters: filters.map(filter => ({ ...filter, definition: filterDefinitionSchema.parse(filter.definition) })), projects: userProjects };
}
export async function createLabel(input: z.infer<typeof labelInput>) {
  const userId = await requireUserId(); const data = labelInput.parse(input);
  const [label] = await db.insert(labels).values({ userId, ...data }).returning();
  revalidatePath("/", "layout"); return label.id;
}
export async function updateLabel(id: string, input: z.infer<typeof labelInput>) {
  const userId = await requireUserId(); const data = labelInput.parse(input);
  await assertOwnedLabels(userId, [id]);
  await db.update(labels).set(data).where(and(eq(labels.id, id), eq(labels.userId, userId)));
  revalidatePath("/", "layout");
}
export async function deleteLabel(id: string) {
  const userId = await requireUserId(); await assertOwnedLabels(userId, [id]);
  await db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId)));
  revalidatePath("/", "layout");
}
const filterInput = z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(1).max(100), definition: filterDefinitionSchema });
export async function saveFilter(input: z.infer<typeof filterInput>) {
  const userId = await requireUserId(); const { id, ...data } = filterInput.parse(input);
  if (data.definition.labelId) await assertOwnedLabels(userId, [data.definition.labelId]);
  if (data.definition.projectId) {
    const [owned] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, data.definition.projectId), eq(projects.userId, userId))).limit(1);
    if (!owned) throw new Error("Project not found");
  }
  if (id) {
    const [owned] = await db.select({ id: savedFilters.id }).from(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).limit(1);
    if (!owned) throw new Error("Filter not found");
    await db.update(savedFilters).set(data).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId)));
  } else await db.insert(savedFilters).values({ userId, ...data });
  revalidatePath("/", "layout");
}
export async function deleteFilter(id: string) {
  const userId = await requireUserId();
  const [owned] = await db.select({ id: savedFilters.id }).from(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId))).limit(1);
  if (!owned) throw new Error("Filter not found");
  await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, userId)));
  revalidatePath("/", "layout");
}
export async function bulkTaskMetadata(input: z.infer<typeof taskMetadataSchema> & { ids: string[] }) {
  const userId = await requireUserId();
  const { ids, labelIds, ...data } = taskMetadataSchema.extend({ ids: z.array(z.string().min(1)).min(1).max(200) }).parse(input);
  const unique = [...new Set(ids)];
  const owned = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, unique)));
  if (owned.length !== unique.length) throw new Error("Task not found");
  if (labelIds !== undefined) await assertOwnedLabels(userId, labelIds);
  if (Object.keys(data).length) await db.update(tasks).set(data).where(and(eq(tasks.userId, userId), inArray(tasks.id, unique)));
  if (labelIds !== undefined) for (const id of unique) await replaceTaskLabels(userId, id, labelIds);
  revalidatePath("/", "layout");
}
