import { createApi } from "./app";
import { productionDependencies } from "./production";
import { auth } from "@todalo/auth";
import { getOwnedTask, getTasksForUser, getTodayTasksForUser } from "@todalo/server/today";
import * as projects from "@todalo/server/projects";
import * as organization from "@todalo/server/organization";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import * as bulk from "@todalo/server/bulk";
import { createAuthRoutes } from "./auth-routes";
import { createTaskRoutes } from "./task-routes";
import { taskOperations } from "./task-operations";
import { createBulkRoutes } from "./bulk-routes";
import { createProjectRoutes } from "./project-routes";
import { createGoalRoutes } from "./goal-routes";
import { createSeasonRoutes } from "./season-routes";
import * as seasons from "@todalo/server/seasons";
import { createRitualRoutes } from "./ritual-routes";
import { createCoachRoutes } from "./coach-routes";
import * as coach from "@todalo/server/coach-store";
import { createCoachModel } from "@todalo/server/coach";
import { createDraftRoutes } from "./draft-routes";
import * as drafts from "@todalo/server/drafts-store";
import { createCoachChatRoutes } from "./coach-chat-routes";
import * as coachChat from "@todalo/server/coach-chat-store";
import { createCoachPlanningRoutes } from "./coach-planning-routes";
import { createCoachPatternRoutes } from "./coach-pattern-routes";
import * as coachPatterns from "@todalo/server/coach-patterns-store";
import { createCapacityRoutes } from "./capacity-routes";
import * as coachSuggestions from "@todalo/server/coach-suggestions-store";
import * as rituals from "@todalo/server/rituals";
import * as goals from "@todalo/server/goals";
import * as milestones from "@todalo/server/milestones";
import { createAttachmentRoutes } from "./attachment-routes";
import { createCommentRoutes } from "./comment-routes";
import * as comments from "@todalo/server/comments";
import { createSettingsRoutes } from "./settings-routes";
import * as settings from "@todalo/server/settings";
import * as keyboard from "@todalo/server/keyboard";
import * as attachments from "@todalo/server/attachments";
import * as metadata from "@todalo/server/metadata";
import { createMetadataRoutes } from "./metadata-routes";
import { createSearchRoutes } from "./search-routes";
import { createCalendarRoutes } from "./calendar-routes";
import * as calendar from "@todalo/server/calendar-connections";
import { handleCalendarWebhook, startCalendarMaintenance } from "@todalo/server/calendar-sync";
import { getSyncDelta } from "@todalo/server/sync";
import { createSyncRoutes } from "./sync-routes";
import * as live from "@todalo/server/live";
import { createImportRoutes } from "./import-routes";
import { todoistClient } from "./todoist";
import * as todoistImport from "@todalo/server/todoist-import-run";
import { db } from "@todalo/db";
import { sql } from "drizzle-orm";

// Opening the database link costs seconds; pay it at boot, not on the first Ramble.
db.execute(sql`select 1`).catch(() => {});

const dependencies = productionDependencies();
// Live sync: a Ramble save (socket or HTTP) tells the user's devices to pull the delta.
const commitTodos = dependencies.commit;
dependencies.commit = async (userId, ...rest) => { const count = await commitTodos(userId, ...rest); live.publish(userId, "sync"); return count; };
const idConflict = (error: unknown) => { if (error instanceof metadata.MetadataIdConflictError) return null; throw error; };
const verify = async (headers: Headers) => (await auth.api.getSession({ headers, query: { disableCookieCache: true } }))?.user.id ?? null;
const app = createApi(dependencies)
  // Live sync: every successful /api/v1 write tells the user's devices (this one
  // included) to pull the delta. Hooks cover the routes registered after them.
  .onAfterResponse(async ({ request, set, responseValue }) => {
    if (request.method === "GET" || !new URL(request.url).pathname.startsWith("/api/v1/")) return;
    const code = responseValue instanceof Response ? responseValue.status : Number(set.status ?? 200);
    if (code >= 400) return;
    const userId = await verify(request.headers).catch(() => null);
    if (userId) live.publish(userId, "sync");
  })
  .use(createSyncRoutes({ verify, delta: getSyncDelta }))
  .use(createAuthRoutes(auth)).use(createTaskRoutes({
  verify,
  today: (userId) => getTodayTasksForUser(userId),
  task: getOwnedTask,
  allowedOrigins: dependencies.allowedOrigins,
  ...taskOperations,
})).use(createBulkRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  complete: async (userId, items, operationId, confirmCriteria) => { const result = await bulk.completeTasks(userId, items, operationId, confirmCriteria); return result === "missing" ? null : result; },
  remove: bulk.deleteTasks,
  clearDates: bulk.clearTaskDates,
  metadata: bulk.updateTasksMetadata,
  // A missing or foreign task or destination is the route's 404.
  move: (userId, ids, destination) => organization.moveTasks(userId, ids, destination)
    .then(() => true, (error: unknown) => { if (error instanceof TaskOrganizationError) return false; throw error; }),
  reorder: async (userId, id, move) => { const result = await bulk.reorderTask(userId, id, move); return result === "invalid" || result === "criteria" ? result : result === "reordered"; },
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
})).use(createGoalRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  list: goals.getGoalsForUser,
  get: goals.getOwnedGoal,
  create: goals.createGoal,
  update: goals.updateGoal,
  reorder: goals.reorderGoal,
  hidden: goals.getGoalsHidden,
  setHidden: goals.setGoalsHidden,
  work: goals.getGoalWork,
  links: goals.getGoalLinks,
  link: goals.linkGoal,
  unlink: goals.unlinkGoal,
  tasks: (userId) => getTasksForUser(userId),
  dismissed: goals.getDismissedGoals,
  dismiss: goals.dismissGoalSuggestion,
  milestone: milestones.getMilestone,
  setMilestone: milestones.setMilestone,
  clearMilestone: milestones.clearMilestone,
  milestones: milestones.getGoalMilestones,
  coach: {
    provider: coach.getCoachProvider,
    model: (config) => createCoachModel(config),
    cached: coachSuggestions.getCachedGoalSuggestions,
    cache: coachSuggestions.cacheGoalSuggestions,
    patterns: coachPatterns.getPatterns,
  },
})).use(createCapacityRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  provider: coach.getCoachProvider,
  model: (config) => createCoachModel(config),
  season: seasons.getCurrentSeason,
  capacity: coachSuggestions.getCapacity,
  saveAvailable: coachSuggestions.saveAvailableMinutes,
  cache: coachSuggestions.cacheCapacity,
  patterns: coachPatterns.getPatterns,
})).use(createSeasonRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  current: seasons.getCurrentSeason,
  start: seasons.startSeason,
  addGoal: seasons.addSeasonGoal,
  updateGoal: seasons.updateSeasonGoal,
  removeGoal: seasons.removeSeasonGoal,
  past: seasons.listPastSeasons,
  end: seasons.endSeason,
  statusInputs: rituals.getStatusInputs,
})).use(createRitualRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  settings: rituals.getRitualSettings,
  save: rituals.saveRitualSettings,
  runStatus: rituals.getRunStatus,
  record: rituals.recordRun,
  ritualTask: rituals.getRitualTask,
  placeRitualItem: rituals.placeRitualItem,
  weekInputs: rituals.getWeekInputs,
  season: async (userId) => (await seasons.getCurrentSeason(userId))?.season ?? null,
  seasonReviewInputs: rituals.getSeasonReviewInputs,
})).use(createCoachRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  state: coach.getCoachState,
  setActive: coach.setCoachActive,
  chatgptAuth: coach.chatgptAuth,
  chatgptClient: coach.getChatgptClient,
  saveChatgptClient: coach.saveChatgptClient,
  forgetChatgptClient: coach.forgetChatgptClient,
  chatgpt: coach.getChatgpt,
  saveChatgpt: coach.saveChatgpt,
  setChatgptModel: coach.setChatgptModel,
  removeChatgpt: coach.removeChatgpt,
  save: coach.saveCoachProvider,
  remove: coach.removeCoachProvider,
  model: (config) => createCoachModel(config),
  season: seasons.getCurrentSeason,
  statusInputs: rituals.getStatusInputs,
  cached: coach.getCachedExplanations,
  cache: coach.cacheExplanation,
  recommendations: coach.getCachedRecommendations,
  cacheRecommendation: coach.cacheRecommendation,
  dismissRecommendation: coach.dismissRecommendation,
  moves: coach.getTaskMoves,
  patterns: coachPatterns.getPatterns,
})).use(createCoachPatternRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  provider: coach.getCoachProvider,
  model: (config) => createCoachModel(config),
  season: seasons.getCurrentSeason,
  statusInputs: rituals.getStatusInputs,
  moves: coach.getTaskMoves,
  patterns: coachPatterns.getPatterns,
  add: coachPatterns.addPatterns,
  update: coachPatterns.updatePattern,
  remove: coachPatterns.removePattern,
})).use(createDraftRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  provider: coach.getCoachProvider,
  model: (config) => createCoachModel(config),
  dayContext: drafts.getDayContext,
  drafts: drafts.getOpenDrafts,
  save: drafts.saveDraft,
  tasks: drafts.getDraftTasks,
  resolve: drafts.resolveDraft,
  recommendation: coach.getRecommendation,
  patterns: coachPatterns.getPatterns,
})).use(createCoachChatRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  provider: coach.getCoachProvider,
  model: (config) => createCoachModel(config),
  dayContext: drafts.getDayContext,
  season: seasons.getCurrentSeason,
  statusInputs: rituals.getStatusInputs,
  messages: coachChat.getChatMessages,
  append: coachChat.appendChatMessages,
  clear: coachChat.clearChat,
  saveDraft: drafts.saveDraft,
  patterns: coachPatterns.getPatterns,
})).use(createCoachPlanningRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  provider: coach.getCoachProvider,
  model: (config) => createCoachModel(config),
  dayContext: drafts.getDayContext,
  goal: goals.getOwnedGoal,
  season: seasons.getCurrentSeason,
  milestones: milestones.getGoalMilestones,
  saveDraft: drafts.saveDraft,
  patterns: coachPatterns.getPatterns,
})).use(createAttachmentRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  createFileTasks: attachments.createFileTasks,
  list: attachments.listTaskAttachments,
  read: attachments.readAttachment,
})).use(createCommentRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  list: comments.listComments,
  add: comments.addComment,
  remove: comments.deleteComment,
})).use(createSettingsRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  get: settings.getSettings,
  setSmartDateRecognition: settings.setSmartDateRecognition,
  loadKeyboard: keyboard.loadKeyboardPreferences,
  saveKeyboard: keyboard.saveKeyboardPreferences,
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
})).use(createSearchRoutes({
  verify,
  tasks: (userId) => getTasksForUser(userId),
  projects: projects.getProjectsForUser,
  sections: (userId) => organization.getSectionsForUser(userId),
})).use(createCalendarRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  events: calendar.getCalendarEventsForUser,
  accounts: calendar.getCalendarAccounts,
  setShowEvents: calendar.setAccountShowEvents,
  setVisible: calendar.setCalendarVisible,
  resync: calendar.resyncAccount,
  // Better Auth unlinks with the caller's own session (cookie or bearer).
  disconnect: (userId, accountId, session) => calendar.disconnectAccount(userId, accountId, (body) => auth.api.unlinkAccount({ headers: session, body })),
  webhook: handleCalendarWebhook,
  // The webhook and the stream share this process's bus (see live.ts).
  subscribe: live.subscribe,
  publish: live.publish,
})).use(createImportRoutes({
  verify,
  allowedOrigins: dependencies.allowedOrigins,
  todoist: todoistClient({
    clientId: process.env.TODOIST_CLIENT_ID ?? "",
    clientSecret: process.env.TODOIST_CLIENT_SECRET ?? "",
    redirectUri: `${process.env.BETTER_AUTH_URL}/api/v1/imports/todoist/callback`,
  }),
  context: todoistImport.loadImportContext,
  apply: todoistImport.applyImportPlan,
  promptDue: todoistImport.importPromptDue,
  promptSeen: todoistImport.markImportPromptSeen,
})).listen({
  port: Number(process.env.RAMBLE_PORT ?? 3001),
  hostname: process.env.RAMBLE_HOST ?? "0.0.0.0",
});
console.log(`Ramble API listening on port ${app.server?.port}`);
// Google edits reach tasks by webhook (GOOGLE_WEBHOOK_BASE_URL) or, locally, by syncToken polling.
startCalendarMaintenance((userId) => { live.publish(userId, "calendar"); live.publish(userId, "sync"); });
