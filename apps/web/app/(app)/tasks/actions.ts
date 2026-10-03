"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { nextOccurrenceOnCompletion, recurrenceSchema } from "@/lib/recurrence";
import { pushTaskToCalendar, deleteTaskFromCalendar } from "@/lib/google-calendar";
import { assertTaskParent } from "@todalo/db/task-parent";
import { assertTaskOrganization } from "@todalo/db/task-organization";

const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().min(1).nullable().optional(),
  sectionId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  dueDateEnd: z.coerce.date().nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

async function syncToCalendar(userId: string, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return;
  const result = await pushTaskToCalendar(userId, task);
  if (result && result.googleCalendarEventId !== task.googleCalendarEventId) {
    await db
      .update(tasks)
      .set({ googleCalendarEventId: result.googleCalendarEventId })
      .where(eq(tasks.id, taskId));
  }
}

const createTaskInput = taskInput.extend({ placement: z.object({ edge: z.enum(["top", "bottom", "above", "below"]), anchorId: z.string().optional() }).optional() });
export async function createTask(input: z.infer<typeof createTaskInput>) {
  const userId = await requireUserId();
  const { placement, ...data } = createTaskInput.parse(input);
  await assertTaskOrganization({ userId, projectId: data.projectId ?? null, sectionId: data.sectionId ?? null });
  if (data.parentId) {
    await assertTaskParent({ userId, parentId: data.parentId });
    const [parent] = await db.select().from(tasks).where(and(eq(tasks.id, data.parentId), eq(tasks.userId, userId))).limit(1);
    if (data.projectId !== undefined && data.projectId !== parent.projectId || data.sectionId !== undefined && data.sectionId !== parent.sectionId) throw new Error("A child task must use its parent's project and section");
    data.projectId = parent.projectId; data.sectionId = parent.sectionId;
  }
  let sortOrder = 0;
  if (placement) {
    const collection = await db.select({ id: tasks.id, sortOrder: tasks.sortOrder, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.userId, userId), data.projectId ? eq(tasks.projectId, data.projectId) : sql`${tasks.projectId} is null`)).orderBy(asc(tasks.sortOrder));
    const anchor = collection.find(task => task.id === placement.anchorId);
    if ((placement.edge === "above" || placement.edge === "below") && !anchor) throw new Error("Task not found");
    sortOrder = placement.edge === "top" ? (collection[0]?.sortOrder ?? 0) - 1 : placement.edge === "bottom" ? (collection.at(-1)?.sortOrder ?? -1) + 1 : anchor!.sortOrder + (placement.edge === "below" ? 1 : 0);
    if (anchor) await db.update(tasks).set({ sortOrder: sql`${tasks.sortOrder} + 1` }).where(and(eq(tasks.userId, userId), data.projectId ? eq(tasks.projectId, data.projectId) : sql`${tasks.projectId} is null`, sql`${tasks.sortOrder} >= ${sortOrder}`));
  }
  const [task] = await db.insert(tasks).values({ userId, ...data, sortOrder }).returning();
  if (task.dueDate) await syncToCalendar(userId, task.id);
  revalidatePath("/", "layout");
  return task.id;
}

/** Authorize the entire selection before running any per-task side effects. */
export async function bulkTaskAction(input: { ids: string[]; action: "complete" | "delete" | "clear-date" }) {
  const userId = await requireUserId();
  const { ids, action } = z.object({ ids: z.array(z.string().min(1)).min(1).max(200), action: z.enum(["complete", "delete", "clear-date"]) }).parse(input);
  const unique = [...new Set(ids)];
  const owned = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, unique)));
  if (owned.length !== unique.length) throw new Error("Task not found");
  for (const id of unique) {
    if (action === "complete") await completeTask(id);
    else if (action === "delete") await deleteTask(id);
    else await updateTask({ id, dueDate: null, dueDateEnd: null });
  }
}

const updateTaskInput = taskInput.partial().extend({ id: z.string() });

export async function updateTask(input: z.infer<typeof updateTaskInput>) {
  const userId = await requireUserId();
  const { id, ...data } = updateTaskInput.parse(input);
  const [owned] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!owned) throw new Error("Task not found");
  if (data.projectId !== undefined || data.sectionId !== undefined) {
    await assertTaskOrganization({ userId, projectId: data.projectId === undefined ? owned.projectId : data.projectId, sectionId: data.sectionId === undefined ? (data.projectId !== undefined && data.projectId !== owned.projectId ? null : owned.sectionId) : data.sectionId });
  }
  if (data.parentId) {
    await assertTaskParent({ userId, taskId: id, parentId: data.parentId });
    const [parent] = await db.select().from(tasks).where(and(eq(tasks.id, data.parentId), eq(tasks.userId, userId))).limit(1);
    data.projectId = parent.projectId; data.sectionId = parent.sectionId;
  }
  const projectId = data.projectId === undefined ? owned.projectId : data.projectId;
  const sectionId = data.sectionId === undefined ? (data.projectId !== undefined && data.projectId !== owned.projectId ? null : owned.sectionId) : data.sectionId;
  await assertTaskOrganization({ userId, projectId, sectionId });
  if (data.projectId !== undefined) data.sectionId = sectionId;
  const organizationChanged = projectId !== owned.projectId || sectionId !== owned.sectionId;
  if (organizationChanged && owned.parentId && data.parentId === undefined) data.parentId = null;
  if (data.parentId !== undefined) {
    const [existing] = await db.select({ id: tasks.id }).from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
    if (!existing) throw new Error("Task not found");
    await assertTaskParent({ userId, taskId: id, parentId: data.parentId });
  }
  await db
    .update(tasks)
    .set(data)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (organizationChanged) await db.update(tasks).set({ projectId, sectionId }).where(and(eq(tasks.parentId, id), eq(tasks.userId, userId)));
  if ("dueDate" in data) await syncToCalendar(userId, id);
  revalidatePath("/", "layout");
}

export async function deleteTask(id: string) {
  const userId = await requireUserId();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (task?.googleCalendarEventId) {
    await deleteTaskFromCalendar(userId, task.googleCalendarEventId);
  }
  await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/", "layout");
}

export async function completeTask(id: string) {
  const userId = await requireUserId();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (!task) return;

  if (task.recurrence) {
    const completedAt = new Date();
    const next = nextOccurrenceOnCompletion(task.dueDate, completedAt, task.recurrence);
    if (next) {
      await db.update(tasks).set({ dueDate: next, completedAt: null }).where(eq(tasks.id, id));
      await syncToCalendar(userId, id);
    } else {
      // `until` has passed — complete this occurrence without rescheduling.
      await db.update(tasks).set({ completedAt, status: "done" }).where(eq(tasks.id, id));
    }
  } else {
    await db.update(tasks).set({ completedAt: new Date(), status: "done" }).where(eq(tasks.id, id));
  }
  revalidatePath("/", "layout");
}

export async function reorderTask(id: string, status: "todo" | "in_progress" | "done", sortOrder: number) {
  const userId = await requireUserId();
  await db
    .update(tasks)
    .set({ status, sortOrder })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/", "layout");
}
