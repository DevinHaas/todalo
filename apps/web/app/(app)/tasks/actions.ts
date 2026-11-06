"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import type { CreateTaskInput, UpdateTaskInput } from "@todalo/server/task-input";
import {
  completeTask as completeTaskOperation, createTask as createTaskOperation, deleteTask as deleteTaskOperation, updateTask as updateTaskOperation,
} from "@todalo/server/tasks";
import * as bulk from "@todalo/server/bulk";

export async function createTask(input: CreateTaskInput) {
  const userId = await requireUserId();
  const { id } = await createTaskOperation(userId, input);
  revalidatePath("/", "layout");
  return id;
}

/** Authorize the entire selection before running any per-task side effects (@todalo/server/bulk). */
export async function bulkTaskAction(input: { ids: string[]; action: "complete" | "delete" | "clear-date" }) {
  const userId = await requireUserId();
  const { ids, action } = z.object({ ids: z.array(z.string().min(1)).min(1).max(200), action: z.enum(["complete", "delete", "clear-date"]) }).parse(input);
  const done = action === "complete" ? await bulk.completeTasks(userId, ids.map(id => ({ id }))) !== "missing"
    : action === "delete" ? await bulk.deleteTasks(userId, ids) : await bulk.clearTaskDates(userId, ids);
  if (!done) throw new Error("Task not found");
  revalidatePath("/", "layout");
}

export async function updateTask(input: UpdateTaskInput) {
  const userId = await requireUserId();
  const result = await updateTaskOperation(userId, input);
  if (result === "missing") throw new Error("Task not found");
  if (result === "criteria") throw new Error("This milestone has open done criteria. Tick them before marking it done.");
  revalidatePath("/", "layout");
}

export async function deleteTask(id: string) {
  const userId = await requireUserId();
  await deleteTaskOperation(userId, id);
  revalidatePath("/", "layout");
}

export async function completeTask(id: string) {
  const userId = await requireUserId();
  await completeTaskOperation(userId, id);
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
