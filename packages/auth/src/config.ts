import { betterAuth, type BetterAuthOptions } from "better-auth";
import { bearer } from "better-auth/plugins";

// Both HTTP hosts use this configuration and the existing session database.
// Accepting the database here also lets boundary tests use Better Auth's adapter.
export function createSessionAuth(options: Pick<BetterAuthOptions, "database" | "baseURL" | "secret" | "trustedOrigins" | "socialProviders" | "session" | "logger">) {
  return betterAuth({
    ...options,
    emailAndPassword: { enabled: true },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [bearer({ requireSignature: true })],
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: true },
    },
  });
}

export function configuredOrigins(value: string | undefined): string[] {
  return (value ?? "").split(",").map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin || origin.includes("*") || url.username || url.password) {
      throw new Error("AUTH_TRUSTED_ORIGINS must contain exact HTTP(S) origins");
    }
    return origin;
  });
}
