import { auth } from "@todalo/auth";
import { db } from "@todalo/db";
import { labels, projects, userSettings } from "@todalo/db/schema";
import { eq } from "drizzle-orm";
import { connectSpeech } from "./speech";
import { commitRambleTodos } from "./commit";
import { createSemanticProcessor } from "./semantic-llm";
import type { ApiDependencies } from "./app";

export function productionDependencies(): ApiDependencies {
  const authUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const origins = (process.env.RAMBLE_ALLOWED_ORIGINS ?? new URL(authUrl).origin).split(",").map((origin) => origin.trim());
  return {
    allowedOrigins: new Set(origins),
    verify: async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null,
    preferences: async (userId) => {
      const [settings, owned, ownedLabels] = await Promise.all([
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
        db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.userId, userId)),
        db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.userId, userId)),
      ]);
      return { smartRecognition: settings[0]?.smartDateRecognitionEnabled ?? true, projectIds: new Set(owned.map((project) => project.id)), projects: owned, labels: ownedLabels };
    },
    speech: connectSpeech,
    semantic: createSemanticProcessor(),
    commit: commitRambleTodos,
  };
}
