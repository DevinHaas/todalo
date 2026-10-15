// In-memory project store for the isolated QA API (no database). Mirrors the
// schema: deleting a project sets its tasks' projectId to null (Inbox).
import { createProjectRoutes } from "../../api/src/project-routes";
import type { TaskRecord } from "../../../packages/server/src/task-dto";
import { createAttachmentRoutes } from "../../api/src/attachment-routes";
import { AttachmentError } from "../../../packages/server/src/attachment-http";
import { validateAttachmentFiles } from "../../../packages/server/src/attachment-limits";

type OwnedTask = TaskRecord & { userId: string };
type Project = { id: string; userId: string; name: string; color: string | null };

export function qaProjectRoutes(options: {
  verify: (headers: Headers) => Promise<string | null>;
  allowedOrigins: Set<string>;
  projects: Project[];
  tasks: OwnedTask[];
}) {
  const { projects, tasks } = options;
  const owned = (userId: string, id: string) => projects.find(project => project.userId === userId && project.id === id) ?? null;
  return createProjectRoutes({
    verify: options.verify,
    allowedOrigins: options.allowedOrigins,
    list: async (userId) => projects.filter(project => project.userId === userId).sort((a, b) => a.name.localeCompare(b.name)),
    get: async (userId, id) => owned(userId, id),
    tasks: async (userId, projectId) => tasks.filter(task => task.userId === userId && task.projectId === projectId),
    create: async (userId, name) => { const project = { id: crypto.randomUUID(), userId, name, color: null }; projects.push(project); return project; },
    rename: async (userId, id, name) => { const project = owned(userId, id); if (project) project.name = name; return project; },
    remove: async (userId, id) => {
      const project = owned(userId, id);
      if (!project) return false;
      projects.splice(projects.indexOf(project), 1);
      for (const task of tasks) if (task.projectId === id) task.projectId = null;
      return true;
    },
  });
}

type Attachment = { id: string; userId: string; taskId: string; name: string; mediaType: string; byteSize: number; content: string };

// In-memory twin of @todalo/server/attachments: same limits and owner checks,
// base64 storage like the task_attachments row. Created file tasks join `tasks`.
export function qaAttachmentRoutes(options: {
  verify: (headers: Headers) => Promise<string | null>;
  allowedOrigins: Set<string>;
  projects: Project[];
  tasks: OwnedTask[];
  attachments: Attachment[];
}) {
  const { projects, tasks, attachments } = options;
  const ownedTask = (userId: string, id: string) => {
    const task = tasks.find(item => item.userId === userId && item.id === id);
    if (!task || (task.projectId && !projects.some(project => project.userId === userId && project.id === task.projectId))) throw new AttachmentError("Task not found.", 404);
    return task;
  };
  return createAttachmentRoutes({
    verify: options.verify,
    allowedOrigins: options.allowedOrigins,
    createFileTasks: async (userId, projectId, files) => {
      if (!projects.some(project => project.userId === userId && project.id === projectId)) throw new AttachmentError("Project not found.", 404);
      try { validateAttachmentFiles(files); } catch (error) { throw new AttachmentError((error as Error).message, 400); }
      const created = await Promise.all(files.map(async file => {
        const task: OwnedTask = { id: crypto.randomUUID(), userId, title: file.name, description: null, status: "todo", priority: 4, projectId, parentId: null, dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: new Date() };
        return { task, attachment: { id: crypto.randomUUID(), userId, taskId: task.id, name: file.name, mediaType: file.type || "application/octet-stream", byteSize: file.size, content: Buffer.from(await file.arrayBuffer()).toString("base64") } };
      }));
      for (const { task, attachment } of created) { tasks.push(task); attachments.push(attachment); }
      return created.map(({ task }) => ({ id: task.id, title: task.title }));
    },
    list: async (userId, taskId) => {
      ownedTask(userId, taskId);
      return attachments.filter(item => item.userId === userId && item.taskId === taskId).map(({ id, name, mediaType, byteSize }) => ({ id, name, mediaType, byteSize }));
    },
    read: async (userId, id) => {
      const attachment = attachments.find(item => item.userId === userId && item.id === id);
      if (!attachment) throw new AttachmentError("Attachment not found.", 404);
      ownedTask(userId, attachment.taskId);
      return attachment;
    },
  });
}
