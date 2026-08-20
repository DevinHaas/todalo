import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { Recurrence } from "@/lib/recurrence";

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
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").default("todo").notNull(),
    dueDate: timestamp("due_date"),
    dueDateEnd: timestamp("due_date_end"),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    googleCalendarEventId: text("google_calendar_event_id"),
    completedAt: timestamp("completed_at"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("tasks_userId_idx").on(table.userId)],
);

export const projectRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}));

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
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
