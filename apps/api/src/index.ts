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
import { createSettingsRoutes } from "./settings-routes";
import * as settings from "@todalo/server/settings";
import * as attachments from "@todalo/server/attachments";
import * as metadata from "@todalo/server/metadata";
import { createMetadataRoutes } from "./metadata-routes";

const dependencies = productionDependencies();
const idConflict = (error: unknown) => { if (error instanceof metadata.MetadataIdConflictError) return null; throw error; };
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
})).use(createSettingsRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  get: settings.getSettings,
  setSmartDateRecognition: settings.setSmartDateRecognition,
})).use(createMetadataRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  metadata: metadata.getMetadataForUser,
  label: metadata.getOwnedLabel,
  filter: metadata.getOwnedFilter,
  tasks: (userId) => getTasksForUser(userId),
  // Another user's create ID is the route's 409.
  createLabel: (userId, input) => metadata.createLabel(userId, input).catch(idConflict),
  updateLabel: metadata.updateLabel,
  removeLabel: metadata.deleteLabel,
  createFilter: (userId, input) => metadata.createFilter(userId, input).catch(idConflict),
  updateFilter: metadata.updateFilter,
  removeFilter: metadata.deleteFilter,
})).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
