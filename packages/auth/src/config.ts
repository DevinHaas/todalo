import { betterAuth, type BetterAuthOptions } from "better-auth";
import { bearer } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { nativeOAuth } from "./native-oauth";

// Both HTTP hosts use this configuration and the existing session database.
// Accepting the database here also lets boundary tests use Better Auth's adapter.
// `onUserDeleted` runs after the user row (and, by cascade, all their data) is gone.
export function createSessionAuth({ onUserDeleted, ...options }: Pick<BetterAuthOptions, "database" | "baseURL" | "secret" | "trustedOrigins" | "socialProviders" | "session" | "logger"> & { onUserDeleted?: (userId: string) => Promise<void> }) {
  return betterAuth({
    ...options,
    // Settings › Account › Delete account: POST /api/auth/delete-user. Needs the password, or a session
    // younger than a day (Better Auth's freshAge) for Google-only accounts. Every table cascades from `user`.
    user: { deleteUser: { enabled: true, afterDelete: onUserDeleted ? (user) => onUserDeleted(user.id) : undefined } },
    emailAndPassword: { enabled: true },
    // update-user takes any string as the image; only a small uploaded photo or a provider's https URL is kept
    databaseHooks: { user: { update: { before: async (user) => {
      if (!profileImageAllowed(user.image)) throw new APIError("BAD_REQUEST", { message: "Choose a JPEG, PNG or WebP photo." });
    } } } },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [bearer({ requireSignature: true }), nativeOAuth()],
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

/** A profile photo: unset, a provider's https URL (Google), or a small data URL from the app's photo picker. */
export function profileImageAllowed(image: unknown): boolean {
  if (image === undefined || image === null) return true;
  if (typeof image !== "string" || image.length > 200_000) return false;
  return /^https:\/\/\S+$/.test(image) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image);
}
