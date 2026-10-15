import { createApi } from "./app";
import { productionDependencies } from "./production";
import { auth } from "@todalo/auth";
import { getOwnedTask, getTasksForUser, getTodayTasksForUser } from "@todalo/server/today";
import * as projects from "@todalo/server/projects";
import * as organization from "@todalo/server/organization";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import { createAuthRoutes } from "./auth-routes";
import { createTaskRoutes } from "./task-routes";
import { taskOperations } from "./task-operations";
import { createProjectRoutes } from "./project-routes";
import { createAttachmentRoutes } from "./attachment-routes";
import * as attachments from "@todalo/server/attachments";

const dependencies = productionDependencies();
const verify = async (headers: Headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null;
const app = createApi(dependencies).use(createAuthRoutes(auth)).use(createTaskRoutes({
  verify,
  today: (userId) => getTodayTasksForUser(userId),
  task: getOwnedTask,
  allowedOrigins: dependencies.allowedOrigins,
  ...taskOperations,
})).use(createProjectRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  list: projects.getProjectsForUser,
  get: projects.getOwnedProject,
  tasks: getTasksForUser,
  create: (userId, name) => projects.createProject(userId, { name }),
  rename: (userId, id, name) => projects.updateProject(userId, id, { name }),
  remove: projects.deleteProject,
  sections: organization.getSectionsForUser,
  // A missing or foreign project is a TaskOrganizationError: the route's 404.
  createSection: (userId, projectId, name) => organization.createSection(userId, projectId, name)
    .catch((error: unknown) => { if (error instanceof TaskOrganizationError) return null; throw error; }),
  removeSection: organization.deleteSection,
  destinations: organization.getOrganizationDestinations,
})).use(createAttachmentRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  createFileTasks: attachments.createFileTasks,
  list: attachments.listTaskAttachments,
  read: attachments.readAttachment,
})).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
