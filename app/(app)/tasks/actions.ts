"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { getNextDueDate, recurrenceSchema } from "@/lib/recurrence";
import { pushTaskToCalendar, deleteTaskFromCalendar } from "@/lib/google-calendar";

const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional(),
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
  const [task] = await db.insert(tasks).values({ userId, ...data }).returning();
  if (task.dueDate) await syncToCalendar(userId, task.id);
  revalidatePath("/");
}

const updateTaskInput = taskInput.partial().extend({ id: z.string() });

export async function updateTask(input: z.infer<typeof updateTaskInput>) {
  const userId = await requireUserId();
  const { id, ...data } = updateTaskInput.parse(input);
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
    const base = task.dueDate ?? new Date();
    await db
      .update(tasks)
      .set({ dueDate: getNextDueDate(base, task.recurrence), completedAt: null })
      .where(eq(tasks.id, id));
    await syncToCalendar(userId, id);
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
