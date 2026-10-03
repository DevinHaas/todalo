"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { nextOccurrenceOnCompletion, recurrenceSchema } from "@/lib/recurrence";
import { pushTaskToCalendar, deleteTaskFromCalendar } from "@/lib/google-calendar";
import { assertTaskParent } from "@todalo/db/task-parent";

const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().min(1).nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  dueDate: z.coerce.date().optional(),
  dueDateEnd: z.coerce.date().optional(),
  recurrence: recurrenceSchema.optional(),
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

export async function createTask(input: z.infer<typeof taskInput>) {
  const userId = await requireUserId();
  const data = taskInput.parse(input);
  if (data.parentId) await assertTaskParent({ userId, parentId: data.parentId });
  const [task] = await db.insert(tasks).values({ userId, ...data }).returning();
  if (task.dueDate) await syncToCalendar(userId, task.id);
  revalidatePath("/");
}

const updateTaskInput = taskInput.partial().extend({ id: z.string() });

export async function updateTask(input: z.infer<typeof updateTaskInput>) {
  const userId = await requireUserId();
  const { id, ...data } = updateTaskInput.parse(input);
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
  if ("dueDate" in data) await syncToCalendar(userId, id);
  revalidatePath("/");
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
  revalidatePath("/");
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
  revalidatePath("/");
}

export async function reorderTask(id: string, status: "todo" | "in_progress" | "done", sortOrder: number) {
  const userId = await requireUserId();
  await db
    .update(tasks)
    .set({ status, sortOrder })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  revalidatePath("/");
}
