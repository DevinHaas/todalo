import { createSessionAuth, configuredOrigins } from "./config";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@todalo/db";
import { syncChanges } from "@todalo/db/schema";
import { eq } from "drizzle-orm";

const authUrl = process.env.BETTER_AUTH_URL;
export const auth = createSessionAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // The browser client on app.todalo.app (served by the API) runs Google sign-in on its own
  // host, so the callback and the session cookie land there. Every other host keeps
  // BETTER_AUTH_URL, and its protocol keeps the cookie names (__Secure- or not) unchanged.
  baseURL: authUrl ? { allowedHosts: ["app.todalo.app"], fallback: authUrl, protocol: authUrl.startsWith("https://") ? "https" : "http" } : undefined,
  trustedOrigins: configuredOrigins(process.env.AUTH_TRUSTED_ORIGINS),
  // The cascade's sync_touch() triggers leave change rows behind (sync_changes has no FK to user).
  onUserDeleted: async (userId) => { await db.delete(syncChanges).where(eq(syncChanges.userId, userId)); },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      accessType: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
    },
  },
});
