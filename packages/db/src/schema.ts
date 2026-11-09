import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgEnum,
  date,
  bigint,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { Recurrence } from "@todalo/ramble/recurrence";

// Better Auth tables (regenerate with `bunx @better-auth/cli generate` after changing lib/auth.ts config)
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const taskStatus = pgEnum("task_status", ["todo", "in_progress", "done"]);

export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Goals (see CONTEXT.md): the top level of the sidebar. Archiving is soft
// (archivedAt set): an archived goal leaves the sidebar but keeps its data.
export const goals = pgTable("goals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  // A goalColors key (goal-dto.ts); existing goals got distinct ones in 0018.
  color: text("color").default("blue").notNull(),
  // Ticket 14c: a goalIcons name (goal-dto.ts).
  icon: text("icon").default("target").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [index("goals_userId_idx").on(table.userId)]);

export const sections = pgTable("sections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("sections_projectId_idx").on(table.projectId)]);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    parentId: text("parent_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    sectionId: text("section_id").references(() => sections.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: integer("priority").default(4).notNull(),
    deadline: timestamp("deadline"),
    status: taskStatus("status").default("todo").notNull(),
    dueDate: timestamp("due_date"),
    dueDateEnd: timestamp("due_date_end"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    googleCalendarEventId: text("google_calendar_event_id"),
    completedAt: timestamp("completed_at"),
    // Operation ID of the last applied completion, so a retried completion of a
    // recurring task is recognised after the task has moved to its next date.
    lastCompletionId: text("last_completion_id"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tasks_userId_idx").on(table.userId),
    index("tasks_parentId_idx").on(table.parentId),
  ],
);

// Bounded attachments live separately so ordinary task reads never load content.
export const taskAttachments = pgTable("task_attachments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("task_attachments_taskId_idx").on(table.taskId)]);

// Task comments (author is the task's owner; tasks are single-user). Imported
// Todoist notes land here too, with the note's posted time as createdAt.
export const taskComments = pgTable("task_comments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("task_comments_taskId_idx").on(table.taskId)]);

export const projectRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}));

export const labels = pgTable("labels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("labels_userId_idx").on(table.userId)]);

export const taskLabels = pgTable("task_labels", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("task_labels_task_label_idx").on(table.taskId, table.labelId), index("task_labels_userId_idx").on(table.userId)]);

// Goals ticket 02: explicit many-to-many links. Deleting a goal, project or
// task drops only its links; unlinking deletes only the link row.
export const goalProjects = pgTable("goal_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("goal_projects_goal_project_idx").on(table.goalId, table.projectId), index("goal_projects_userId_idx").on(table.userId)]);

export const goalTasks = pgTable("goal_tasks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  // Goals ticket 06: non-null marks the task as a milestone for this goal and
  // holds its ordered done criteria; unlinking drops the milestone with the link.
  milestoneCriteria: jsonb("milestone_criteria").$type<{ text: string; done: boolean }[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("goal_tasks_goal_task_idx").on(table.goalId, table.taskId), index("goal_tasks_userId_idx").on(table.userId)]);

// Goals ticket 03: a goal suggestion the user dismissed for one task stays hidden for that task.
export const goalSuggestionDismissals = pgTable("goal_suggestion_dismissals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("goal_suggestion_dismissals_task_goal_idx").on(table.taskId, table.goalId), index("goal_suggestion_dismissals_userId_idx").on(table.userId)]);

// Goals ticket 04: a season is a time box of lengthDays calendar days from
// startDate (a date in the user's zone). It is current until endedAt is set
// (ticket 05); the partial unique index allows one current season per user.
export const seasons = pgTable("seasons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  startDate: date("start_date", { mode: "string" }).notNull(),
  lengthDays: integer("length_days").notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [index("seasons_userId_idx").on(table.userId), uniqueIndex("seasons_one_current_idx").on(table.userId).where(sql`${table.endedAt} is null`)]);

export const seasonGoalTier = pgEnum("season_goal_tier", ["primary", "secondary"]);

// A goal's tier and target text within one season. carriedFromId points at the
// earlier season's row it continued from (ticket 05); ended seasons keep their rows as history.
export const seasonGoals = pgTable("season_goals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  tier: seasonGoalTier("tier").notNull(),
  target: text("target").notNull(),
  carriedFromId: text("carried_from_id").references((): AnyPgColumn => seasonGoals.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [uniqueIndex("season_goals_season_goal_idx").on(table.seasonId, table.goalId), index("season_goals_userId_idx").on(table.userId)]);

// Goals ticket 11: which rituals the user does and when (no row = all off).
// The Check-in sits on the schedule as a recurring task (checkInTaskId), so the
// existing task sync puts it on Google Calendar.
export const ritualSettings = pgTable("ritual_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  checkInEnabled: boolean("check_in_enabled").default(false).notNull(),
  checkInTime: text("check_in_time").default("09:00").notNull(),
  checkInTaskId: text("check_in_task_id").references(() => tasks.id, { onDelete: "set null" }),
  weeklyReviewEnabled: boolean("weekly_review_enabled").default(false).notNull(),
  // 0 = Sunday … 6 = Saturday (Date#getDay).
  weeklyReviewDay: integer("weekly_review_day").default(0).notNull(),
  weeklyReviewTime: text("weekly_review_time").default("17:00").notNull(),
  seasonReviewEnabled: boolean("season_review_enabled").default(false).notNull(),
  // Ticket 14b: the Evening review (rate today's progress) sits on the schedule like the Check-in.
  eveningReviewEnabled: boolean("evening_review_enabled").default(false).notNull(),
  eveningReviewTime: text("evening_review_time").default("20:00").notNull(),
  eveningReviewTaskId: text("evening_review_task_id").references(() => tasks.id, { onDelete: "set null" }),
  // Ticket 14b: "Notify me when a ritual is ready".
  notify: boolean("notify").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const ritualKind = pgEnum("ritual_kind", ["check_in", "weekly_review", "season_review", "evening_review"]);
export const ritualRunStatus = pgEnum("ritual_run_status", ["completed", "skipped"]);
export const progressRatingValue = pgEnum("progress_rating", ["massive", "solid", "mixed", "little", "not_relevant"]);

// One finished (or skipped) ritual per kind and period: the day reflected on
// (Check-in: yesterday; Evening review: today), the week's first day, or the season's start date.
export const ritualRuns = pgTable("ritual_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: ritualKind("kind").notNull(),
  period: date("period", { mode: "string" }).notNull(),
  status: ritualRunStatus("status").notNull(),
  /** Ticket 12: the planning question's answer ("clear" or "help"); null when skipped. */
  planning: text("planning", { enum: ["clear", "help"] }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [uniqueIndex("ritual_runs_user_kind_period_idx").on(table.userId, table.kind, table.period)]);

export const progressRatings = pgTable("progress_ratings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  runId: text("run_id").notNull().references(() => ritualRuns.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  rating: progressRatingValue("rating").notNull(),
  context: text("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("progress_ratings_run_goal_idx").on(table.runId, table.goalId), index("progress_ratings_user_goal_idx").on(table.userId, table.goalId)]);

// Goals ticket 17: the user's Coach AI provider (one per user). The API key is
// AES-256-GCM encrypted with COACH_SECRET_KEY and never sent back; keyLast4 is
// the "…last4" hint. Ticket 17b adds Anthropic (a text column: no migration).
export const coachProviders = pgTable("coach_providers", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["openai", "anthropic", "openrouter", "ollama"] }).notNull(),
  model: text("model").notNull(),
  baseUrl: text("base_url"),
  encryptedKey: text("encrypted_key"),
  keyLast4: text("key_last4"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Goals ticket 17c: one saved configuration per provider kind, so several are
// set up at once. Same columns and sealing as coach_providers; that older
// one-per-user row is read (never rewritten) as its kind's configuration until
// this table has one for the same kind.
export const coachProviderConfigs = pgTable("coach_provider_configs", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["openai", "anthropic", "openrouter", "ollama"] }).notNull(),
  model: text("model").notNull(),
  baseUrl: text("base_url"),
  encryptedKey: text("encrypted_key"),
  keyLast4: text("key_last4"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [primaryKey({ columns: [table.userId, table.provider] })]);

// Goals ticket 17c: the provider the user picked for the Coach (a kind, or
// "chatgpt"). Null or not configured: the most recently configured one.
export const coachSettings = pgTable("coach_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  activeProvider: text("active_provider", { enum: ["openai", "anthropic", "openrouter", "ollama", "chatgpt"] }),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Goals ticket 18: the user's ChatGPT sign-in, kept beside coach_providers so
// the saved key stays as the fallback. encryptedTokens seals the access and
// refresh tokens and their oaiapp_* client ID (COACH_SECRET_KEY); null once
// OpenAI refused a refresh (expired). account_id is unused since the T3-style
// sign-in (it was the device-code flow's ChatGPT account header).
export const coachChatgpt = pgTable("coach_chatgpt", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  encryptedTokens: text("encrypted_tokens"),
  accountId: text("account_id"),
  email: text("email"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// Goals ticket 18: OpenAI's registered client (oaiapp_*) for a user's ChatGPT
// sign-in, per redirect without its port (coach-chatgpt.ts redirectKey). Kept
// after sign-out so the next sign-in reuses it instead of registering again.
// sharing: whether the last sign-in allowed sharing the ChatGPT plan.
export const coachChatgptClients = pgTable("coach_chatgpt_clients", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  redirectKey: text("redirect_key").notNull(),
  clientId: text("client_id").notNull(),
  email: text("email"),
  sharing: boolean("sharing").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.redirectKey] })]);

// Ticket 17: a goal's last Coach status explanation; reused while inputsHash
// (the facts, provider, model and day) is unchanged.
export const coachExplanations = pgTable("coach_explanations", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  inputsHash: text("inputs_hash").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.userId, table.goalId] })]);

// Goals ticket 19: a Coach Draft, staged changes to tasks and their times that
// touch nothing until the user accepts them (ADR 0005, stage-then-commit).
// `period` is the planned day (kind "day"; ticket 20 adds "week"). One open
// draft per kind and period: drafting again closes the previous one.
export const coachDrafts = pgTable("coach_drafts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["day", "week", "chat", "plan"] }).notNull(),
  period: date("period", { mode: "string" }).notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: ["open", "closed"] }).default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [index("coach_drafts_user_status_idx").on(table.userId, table.status)]);

// One operation of a draft. startAt/endAt are the task's NEW dueDate/dueDateEnd
// ("remove" takes it off the schedule: its day at midnight, no end). taskId is
// null for a new task; seenUpdatedAt is the version drafted from (stale check on accept).
export const coachDraftItems = pgTable("coach_draft_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  draftId: text("draft_id").notNull().references(() => coachDrafts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  op: text("op", { enum: ["add", "move", "remove"] }).notNull(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  goalId: text("goal_id").references(() => goals.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  seenUpdatedAt: timestamp("seen_updated_at"),
  state: text("state", { enum: ["pending", "accepted", "declined"] }).default("pending").notNull(),
  // Goals ticket 23: a planning session's new milestone (an "add" due on startAt's day); accepting links it to goalId with these criteria.
  criteria: jsonb("criteria").$type<string[]>(),
}, table => [index("coach_draft_items_draft_idx").on(table.draftId)]);

// Goals ticket 21: a goal's last Coach recommendation, reused while inputsHash
// (facts, provider, model, day) is unchanged. dismissedAt hides it for the rest
// of that season week; a new text keeps the dismissal.
export const coachRecommendations = pgTable("coach_recommendations", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  inputsHash: text("inputs_hash").notNull(),
  text: text("text").notNull(),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.userId, table.goalId] })]);

// Ticket 21: one row each time an open task's date or time changed, written by
// the task_moves_log() trigger (drizzle/0034) so every write path counts.
// `fromDate` is where it was; recurring completions are not moves.
export const taskMoves = pgTable("task_moves", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  fromDate: timestamp("from_date").notNull(),
  toDate: timestamp("to_date"),
  movedAt: timestamp("moved_at").defaultNow().notNull(),
}, table => [index("task_moves_user_moved_idx").on(table.userId, table.movedAt)]);

// Goals ticket 22: the Coach chat, kept per user. An assistant turn that
// proposed changes points at its Draft (kind "chat"); the draft holds them.
export const coachChatMessages = pgTable("coach_chat_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  draftId: text("draft_id").references(() => coachDrafts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("coach_chat_messages_user_created_idx").on(table.userId, table.createdAt)]);

// Goals ticket 24: a Pattern the Coach learned about how the user works, with
// the facts behind it (`evidence`) and what it was learned from (`source`).
// The user edits (editedAt) or deletes any; Coach prompts read only these rows.
export const coachPatterns = pgTable("coach_patterns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  evidence: text("evidence").notNull(),
  source: text("source").notNull(),
  learnedAt: timestamp("learned_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
}, table => [index("coach_patterns_user_idx").on(table.userId)]);

// Goals ticket 25: the Coach's goal suggestions for one task by meaning, reused
// while inputsHash (the task's text, the candidate goals, provider, model) is unchanged.
export const coachGoalSuggestions = pgTable("coach_goal_suggestions", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  inputsHash: text("inputs_hash").notNull(),
  goalIds: jsonb("goal_ids").$type<string[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.userId, table.taskId] })]);

// Ticket 25: the time a week the user has for primary goals, and the Coach's
// last estimate of what they need (reused while inputsHash is unchanged).
export const coachCapacity = pgTable("coach_capacity", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  availableMinutes: integer("available_minutes"),
  inputsHash: text("inputs_hash"),
  estimate: jsonb("estimate").$type<{ goalId: string; minutesPerWeek: number; reason: string }[]>(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const savedFilters = pgTable("saved_filters", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("saved_filters_userId_idx").on(table.userId)]);

export const taskRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
}));

// One row per connected Google account. Backs the account-level "Show
// events in Today/Upcoming" master toggle — gates rendering only, not sync,
// so flipping it back on is instant.
export const calendarAccountSettings = pgTable("calendar_account_settings", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => account.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  showEvents: boolean("show_events").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const syncedCalendars = pgTable(
  "synced_calendars",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    googleCalendarId: text("google_calendar_id").notNull(),
    summary: text("summary").notNull(),
    color: text("color").notNull(),
    // Per-calendar visibility (the eye icon) — gates sync + rendering.
    // Turning this off stops the watch channel and clears the cache.
    enabled: boolean("enabled").default(true).notNull(),
    syncToken: text("sync_token"),
    syncedAt: timestamp("synced_at"),
    channelId: text("channel_id"),
    resourceId: text("resource_id"),
    channelExpiresAt: timestamp("channel_expires_at"),
    // Two-way task sync: this row only feeds Google edits back into the tasks
    // pushed to this calendar (calendar.ts); its events are not cached or shown.
    tasksOnly: boolean("tasks_only").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("synced_calendars_userId_idx").on(table.userId),
    uniqueIndex("synced_calendars_account_calendar_idx").on(table.accountId, table.googleCalendarId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    calendarId: text("calendar_id")
      .notNull()
      .references(() => syncedCalendars.id, { onDelete: "cascade" }),
    // Denormalized for the Today/Upcoming read path — avoids a join through
    // syncedCalendars just to filter by user.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id").notNull(),
    title: text("title").notNull(),
    start: timestamp("start").notNull(),
    end: timestamp("end").notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    eventType: text("event_type"),
    htmlLink: text("html_link"),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("calendar_events_calendar_google_idx").on(table.calendarId, table.googleEventId),
    index("calendar_events_userId_start_idx").on(table.userId, table.start),
  ],
);

// One row per user, holding global app preferences. Extend with more
// fields (time format, date format, week start) as they're built — not
// done yet, see .scratch/smart-quick-add/spec.md.
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  smartDateRecognitionEnabled: boolean("smart_date_recognition_enabled").default(true).notNull(),
  // Set once the post-sign-up "Import from Todoist?" prompt was answered.
  importPromptSeenAt: timestamp("import_prompt_seen_at"),
  // Goals ticket 01: hides the sidebar's Goals section; goals keep their data.
  goalsHidden: boolean("goals_hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Which external item (e.g. a Todoist task) became which local row, so a
// re-run import skips what it already brought in. localId is polymorphic by
// `kind` (no FK); an import treats a mapping whose local row is gone as unmapped.
export const importMappings = pgTable("import_mappings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  kind: text("kind").$type<"project" | "section" | "task" | "label">().notNull(),
  externalId: text("external_id").notNull(),
  localId: text("local_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("import_mappings_external_idx").on(table.userId, table.provider, table.kind, table.externalId)]);

export const userKeyboardPreferences = pgTable("user_keyboard_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(user, {
    fields: [userSettings.userId],
    references: [user.id],
  }),
}));

export const calendarAccountSettingsRelations = relations(calendarAccountSettings, ({ one }) => ({
  account: one(account, {
    fields: [calendarAccountSettings.accountId],
    references: [account.id],
  }),
}));

export const syncedCalendarsRelations = relations(syncedCalendars, ({ one, many }) => ({
  account: one(account, {
    fields: [syncedCalendars.accountId],
    references: [account.id],
  }),
  events: many(calendarEvents),
}));

export const calendarEventRelations = relations(calendarEvents, ({ one }) => ({
  calendar: one(syncedCalendars, {
    fields: [calendarEvents.calendarId],
    references: [syncedCalendars.id],
  }),
}));

// Live sync (packages/server/src/sync.ts): one row per changed entity, kept
// current by the sync_touch() triggers in drizzle/0024_sync_changes.sql on
// every table the client caches. `xid` is the last writing transaction; the
// delta cursor is a snapshot xmin, so a late commit can never be skipped. No
// FK to user: rows are written while a user's data cascades away.
export const syncChanges = pgTable("sync_changes", {
  userId: text("user_id").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  xid: bigint("xid", { mode: "number" }).notNull(),
}, table => [primaryKey({ columns: [table.entity, table.entityId] }), index("sync_changes_user_xid_idx").on(table.userId, table.xid)]);
