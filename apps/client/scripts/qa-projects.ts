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
import { createBulkRoutes } from "../../api/src/bulk-routes";
import { planReorder } from "../../../packages/server/src/bulk-input";
import { planCompletion, type CompletionTarget } from "../../../packages/server/src/task-rules";
import { MissingReferenceError } from "../../../packages/server/src/metadata-input";

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

type BulkTask = OwnedTask & { updatedAt: Date; recurrence: CompletionTarget["recurrence"]; lastCompletionId: string | null };

/**
 * Memory twin of @todalo/server/bulk and organization.moveTasks (ticket 15):
 * every selected task must be the user's before anything changes; the array
 * order is the manual order (reorder renumbers a collection, a move appends).
 * QA_BULK_FAILS=1 answers every bulk write with a 500 after applying nothing.
 */
export function qaBulkRoutes(options: {
  verify: (headers: Headers) => Promise<string | null>;
  allowedOrigins: Set<string>;
  projects: Project[];
  sections: QaSection[];
  labels: { id: string; userId: string }[];
  tasks: BulkTask[];
}) {
  const { projects, sections, labels, tasks } = options;
  const owned = (userId: string, ids: string[]) => {
    if (process.env.QA_BULK_FAILS) throw new Error("QA: bulk write failed");
    const rows = [...new Set(ids)].map(id => tasks.find(task => task.userId === userId && task.id === id));
    return rows.every(Boolean) ? rows as BulkTask[] : null;
  };
  const touch = (task: BulkTask, change: Partial<BulkTask>) => Object.assign(task, change, { updatedAt: new Date() });
  // Rewrites the array slots a collection occupies in the given order.
  const arrange = (members: BulkTask[], order: string[]) => {
    const slots = members.map(task => tasks.indexOf(task));
    order.forEach((id, index) => { tasks[slots[index]] = members.find(task => task.id === id)!; });
  };
  return createBulkRoutes({
    verify: options.verify,
    allowedOrigins: options.allowedOrigins,
    complete: async (userId, items, operationId) => {
      if (!owned(userId, items.map(item => item.id))) return null;
      const result = { completed: [] as string[], changed: [] as string[] };
      for (const item of items) {
        const task = tasks.find(row => row.id === item.id)!;
        const plan = planCompletion({ ...task, dueDate: task.dueDate ? new Date(task.dueDate) : null }, { occurrence: item.occurrence, operationId });
        if (plan.kind === "write") touch(task, plan.patch);
        (plan.kind === "changed" ? result.changed : result.completed).push(item.id);
      }
      return result;
    },
    remove: async (userId, ids) => {
      const rows = owned(userId, ids);
      for (const row of rows ?? []) tasks.splice(tasks.indexOf(row), 1);
      return Boolean(rows);
    },
    clearDates: async (userId, ids) => {
      const rows = owned(userId, ids);
      for (const row of rows ?? []) touch(row, { dueDate: null, dueDateEnd: null });
      return Boolean(rows);
    },
    metadata: async (userId, ids, { labelIds, ...fields }) => {
      const rows = owned(userId, ids);
      if (!rows) return false;
      if (labelIds?.some(id => !labels.some(label => label.userId === userId && label.id === id))) throw new MissingReferenceError();
      for (const row of rows) touch(row, { ...fields, ...(labelIds && { labelIds: [...new Set(labelIds)] }) });
      return true;
    },
    move: async (userId, ids, destination) => {
      const rows = owned(userId, ids);
      try { validateTaskOrganization({ userId, ...destination }, projects.find(project => project.id === destination.projectId), sections.find(section => section.id === destination.sectionId)); }
      catch (error) { if (error instanceof TaskOrganizationError) return false; throw error; }
      if (!rows) return false;
      for (const row of tasks.filter(task => task.userId === userId && (ids.includes(task.id) || (task.parentId && ids.includes(task.parentId))))) touch(row, destination);
      for (const row of rows) if (row.parentId && !ids.includes(row.parentId)) row.parentId = null;
      for (const row of rows) { tasks.splice(tasks.indexOf(row), 1); tasks.push(row); }
      return true;
    },
    reorder: async (userId, id, anchorId, position) => {
      const [task, anchor] = owned(userId, [id, anchorId]) ?? [];
      if (!task) return false;
      if (!anchor || task.projectId !== anchor.projectId) return "invalid";
      const members = tasks.filter(row => row.userId === userId && row.projectId === task.projectId);
      arrange(members, planReorder(members.map(row => row.id), id, anchorId, position)!);
      return true;
    },
  });
}
