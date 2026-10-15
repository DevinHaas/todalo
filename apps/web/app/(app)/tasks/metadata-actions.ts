"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { assertOwnedLabels, replaceTaskLabels } from "@/lib/task-labels";
import { taskMetadataSchema } from "@/lib/task-metadata";
import * as shared from "@todalo/server/metadata";
import { taskLabels } from "@/db/schema";

export async function getTaskEditorData(id: string) {
  const userId = await requireUserId();
  const [task] = await db.select({ id: tasks.id, title: tasks.title, description: tasks.description, priority: tasks.priority, deadline: tasks.deadline, dueDate: tasks.dueDate, dueDateEnd: tasks.dueDateEnd, recurrence: tasks.recurrence }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!task) throw new Error("Task not found");
  const links = await db.select({ labelId: taskLabels.labelId }).from(taskLabels).where(and(eq(taskLabels.taskId, id), eq(taskLabels.userId, userId)));
  return { ...task, labelIds: links.map(link => link.labelId) };
}

type LabelInput = Parameters<typeof shared.updateLabel>[2];
type FilterInput = Parameters<typeof shared.updateFilter>[2];
// Thin wrappers over @todalo/server/metadata (shared with /api/v1); legacy
// return values and error messages are kept.
export async function getMetadata() {
  const userId = await requireUserId();
  const [metadata, userProjects] = await Promise.all([
    shared.getMetadataForUser(userId),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
  ]);
  return { ...metadata, projects: userProjects };
}
export async function createLabel(input: LabelInput) {
  const userId = await requireUserId();
  const { label } = await shared.createLabel(userId, input);
  revalidatePath("/", "layout"); return label.id;
}
export async function updateLabel(id: string, input: LabelInput) {
  const userId = await requireUserId();
  if (!await shared.updateLabel(userId, id, input)) throw new Error("Label not found");
  revalidatePath("/", "layout");
}
export async function deleteLabel(id: string) {
  const userId = await requireUserId();
  if (!await shared.deleteLabel(userId, id)) throw new Error("Label not found");
  revalidatePath("/", "layout");
}
export async function saveFilter(input: FilterInput & { id?: string }) {
  const userId = await requireUserId(); const { id, ...data } = input;
  if (id) { if (!await shared.updateFilter(userId, id, data)) throw new Error("Filter not found"); }
  else await shared.createFilter(userId, data);
  revalidatePath("/", "layout");
}
export async function deleteFilter(id: string) {
  const userId = await requireUserId();
  if (!await shared.deleteFilter(userId, id)) throw new Error("Filter not found");
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
