// In-memory project store for the isolated QA API (no database). Mirrors the
// schema: deleting a project sets its tasks' projectId to null (Inbox).
import { createProjectRoutes } from "../../api/src/project-routes";
import type { TaskRecord } from "../../../packages/server/src/task-dto";

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
