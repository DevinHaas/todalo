// In-memory project store for the isolated QA API (no database). Mirrors the
// schema: deleting a project sets its tasks' projectId to null (Inbox).
import { createProjectRoutes } from "../../api/src/project-routes";
import type { TaskRecord } from "../../../packages/server/src/task-dto";
import { createAttachmentRoutes } from "../../api/src/attachment-routes";
import { AttachmentError } from "../../../packages/server/src/attachment-http";
import { validateAttachmentFiles } from "../../../packages/server/src/attachment-limits";
import { editConflicts } from "../../../packages/server/src/task-rules";
import { TaskOrganizationError, validateTaskOrganization } from "../../../packages/db/src/task-organization-validation";
import { validateTaskParent } from "../../../packages/db/src/task-parent-validation";
import type { TaskWrites } from "../../api/src/task-routes";

type OwnedTask = TaskRecord & { userId: string };
type Project = { id: string; userId: string; name: string; color: string | null };
export type QaSection = { id: string; userId: string; projectId: string; name: string; sortOrder: number };

export function qaProjectRoutes(options: {
  verify: (headers: Headers) => Promise<string | null>;
  allowedOrigins: Set<string>;
  projects: Project[];
  sections: QaSection[];
  tasks: OwnedTask[];
}) {
  const { projects, sections, tasks } = options;
  const owned = (userId: string, id: string) => projects.find(project => project.userId === userId && project.id === id) ?? null;
  // Legacy order: sortOrder, then name.
  const ownedSections = (userId: string) => sections.filter(section => section.userId === userId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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
      for (const task of tasks) if (task.projectId === id) Object.assign(task, { projectId: null, sectionId: null });
      for (const section of sections.filter(item => item.projectId === id)) sections.splice(sections.indexOf(section), 1);
      return true;
    },
    sections: async (userId, projectId) => ownedSections(userId).filter(section => section.projectId === projectId),
    createSection: async (userId, projectId, name) => {
      if (!owned(userId, projectId)) return null;
      const section = { id: crypto.randomUUID(), userId, projectId, name, sortOrder: 0 };
      sections.push(section);
      return section;
    },
    removeSection: async (userId, id) => {
      const index = sections.findIndex(section => section.userId === userId && section.id === id);
      if (index < 0) return false;
      sections.splice(index, 1);
      for (const task of tasks) if (task.sectionId === id) task.sectionId = null;
      return true;
    },
    destinations: async (userId) => ({ projects: projects.filter(project => project.userId === userId).sort((a, b) => a.name.localeCompare(b.name)), sections: ownedSections(userId) }),
  });
}

/**
 * Memory twin of updateTask's organization branch (@todalo/server/tasks) using
 * the same pure validators: a move detaches a sub-task and carries sub-tasks;
 * nesting joins the parent's project and section.
 * ponytail: a copy of ~15 lines of updateTask; extract a pure planner if they diverge.
 */
export function qaOrganize(options: { projects: Project[]; sections: QaSection[]; tasks: (OwnedTask & { updatedAt: Date })[] }): TaskWrites["organize"] {
  const { projects, sections, tasks } = options;
  return async (userId, id, { updatedAt, ...change }) => {
    const owned = tasks.find(task => task.userId === userId && task.id === id);
    if (!owned) return null;
    if (editConflicts(owned, change, new Date(updatedAt))) return "changed";
    try {
      let { projectId, parentId } = owned;
      let sectionId = owned.sectionId ?? null;
      if ("parentId" in change) {
        const parent = tasks.find(task => task.id === change.parentId);
        validateTaskParent({ userId, taskId: id, parentId: change.parentId }, parent, tasks.some(task => task.parentId === id));
        if (parent) { projectId = parent.projectId; sectionId = parent.sectionId ?? null; }
        parentId = change.parentId;
      } else ({ projectId, sectionId } = change);
      validateTaskOrganization({ userId, projectId, sectionId }, projects.find(project => project.id === projectId), sections.find(section => section.id === sectionId));
      const moved = projectId !== owned.projectId || sectionId !== (owned.sectionId ?? null);
      if (moved && !("parentId" in change)) parentId = null;
      Object.assign(owned, { projectId, sectionId, parentId, updatedAt: new Date() });
      if (moved) for (const task of tasks) if (task.userId === userId && task.parentId === id) Object.assign(task, { projectId, sectionId });
      return owned;
    } catch (error) {
      if (error instanceof TaskOrganizationError) return error.reason === "missing" ? null : "invalid";
      throw error;
    }
  };
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
