import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { projects, tasks, taskAttachments } from "@todalo/db/schema";
import { validateAttachmentFiles } from "./attachment-limits";

export class AttachmentError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function requireOwnedProject(userId: string, projectId: string) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) throw new AttachmentError("Project not found.", 404);
}
export async function requireOwnedTask(userId: string, taskId: string) {
  const [task] = await db.select({ id: tasks.id, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  if (!task) throw new AttachmentError("Task not found.", 404);
  if (task.projectId) await requireOwnedProject(userId, task.projectId);
}
export async function createFileTasks(userId: string, projectId: string, files: File[]) {
  await requireOwnedProject(userId, projectId);
  try { validateAttachmentFiles(files); } catch (error) { throw new AttachmentError((error as Error).message, 400); }
  const newTasks = files.map(file => ({ id: crypto.randomUUID(), userId, projectId, title: file.name }));
  const attachments = await Promise.all(files.map(async (file, index) => ({ id: crypto.randomUUID(), userId, taskId: newTasks[index].id, name: file.name, mediaType: file.type || "application/octet-stream", byteSize: file.size, content: Buffer.from(await file.arrayBuffer()).toString("base64") })));
  // Neon HTTP batch is one database transaction; a failed attachment insert
  // rolls back the task insertion as well.
  await db.batch([db.insert(tasks).values(newTasks), db.insert(taskAttachments).values(attachments)]);
  return newTasks.map(({ id, title }) => ({ id, title }));
}
export async function listTaskAttachments(userId: string, taskId: string) {
  await requireOwnedTask(userId, taskId);
  return db.select({ id: taskAttachments.id, name: taskAttachments.name, mediaType: taskAttachments.mediaType, byteSize: taskAttachments.byteSize }).from(taskAttachments).where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.userId, userId))).orderBy(taskAttachments.createdAt);
}
export async function readAttachment(userId: string, id: string) {
  const [attachment] = await db.select().from(taskAttachments).where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, userId))).limit(1);
  if (!attachment) throw new AttachmentError("Attachment not found.", 404);
  await requireOwnedTask(userId, attachment.taskId);
  return attachment;
}
export function attachmentFailure(error: unknown) {
  if (error instanceof AttachmentError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Attachments could not be loaded or saved. Please retry." }, { status: 503 });
}
