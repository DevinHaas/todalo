// Server-only attachment operations shared by the legacy Next routes and
// /api/v1. Bytes live in R2 or, without it, in the row as base64 (storage.ts), so
// legacy and new transports read and write identical records.
import { and, eq } from "drizzle-orm";
import { db } from "@todalo/db";
import { tasks, taskAttachments } from "@todalo/db/schema";
import { validateAttachmentFiles } from "./attachment-limits";
import { AttachmentError, type UploadedFile } from "./attachment-http";
import { getOwnedProject } from "./projects";
import { fileContent, storeFile } from "./storage";

export { AttachmentError, attachmentDownload, readUploadForm, uploadedFiles } from "./attachment-http";

export async function requireOwnedProject(userId: string, projectId: string) {
  if (!await getOwnedProject(userId, projectId)) throw new AttachmentError("Project not found.", 404);
}
export async function requireOwnedTask(userId: string, taskId: string) {
  const [task] = await db.select({ id: tasks.id, projectId: tasks.projectId }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  if (!task) throw new AttachmentError("Task not found.", 404);
  if (task.projectId) await requireOwnedProject(userId, task.projectId);
}

export async function createFileTasks(userId: string, projectId: string, files: UploadedFile[]) {
  await requireOwnedProject(userId, projectId);
  try { validateAttachmentFiles(files); } catch (error) { throw new AttachmentError((error as Error).message, 400); }
  const newTasks = files.map(file => ({ id: crypto.randomUUID(), userId, projectId, title: file.name }));
  const attachments = await Promise.all(files.map(async (file, index) => ({ id: crypto.randomUUID(), userId, taskId: newTasks[index].id, name: file.name, mediaType: file.type || "application/octet-stream", byteSize: file.size, content: await storeFile(new Uint8Array(await file.arrayBuffer())) })));
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
  // ponytail: R2 bytes come back as base64 so downloads keep one shape; stream them if files outgrow 10 MB
  return { ...attachment, content: await fileContent(attachment.content) };
}
