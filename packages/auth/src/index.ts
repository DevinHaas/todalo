import { createSessionAuth, configuredOrigins } from "./config";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@todalo/db";

export const auth = createSessionAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: configuredOrigins(process.env.AUTH_TRUSTED_ORIGINS),
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
