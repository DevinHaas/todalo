import { Elysia } from "elysia";
import { settingsInput, type SettingsDto } from "@todalo/server/settings-input";
import type { KeyboardPreferences } from "@todalo/ramble/keyboard";
import { KeyboardPreferencesError } from "@todalo/ramble/keyboard-account-preferences";
import { writeUser } from "./project-routes";

export interface SettingsStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session (CSRF). */
  allowedOrigins: ReadonlySet<string>;
  get(userId: string): Promise<SettingsDto>;
  /** Writes only the preferences given (ticket 28 adds shareEventTitles). */
  update(userId: string, input: Partial<SettingsDto>): Promise<SettingsDto>;
  /** Ticket 19: account keyboard shortcuts (unreadable rows load as defaults plus an error). */
  loadKeyboard(userId: string): Promise<{ preferences: KeyboardPreferences; error?: string }>;
  /** Validates (shape, conflicts, reserved keys) before writing; throws KeyboardPreferencesError. */
  saveKeyboard(userId: string, input: unknown): Promise<KeyboardPreferences>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;

/** The signed-in account's preferences (ticket 12). Only ever the session's user. */
export function createSettingsRoutes(store: SettingsStore) {
  return new Elysia({ prefix: "/api/v1" })
    .onBeforeHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/settings", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return { settings: await store.get(userId) satisfies SettingsDto };
    })
    .patch("/settings", async ({ request, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = settingsInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      const settings = await store.update(userId, input.data);
      return { settings: { smartDateRecognition: settings.smartDateRecognition, shareEventTitles: settings.shareEventTitles } satisfies SettingsDto };
    })
    .get("/settings/keyboard", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return store.loadKeyboard(userId);
    })
    // The whole preference document is replaced; the shared validator is the trust boundary.
    .put("/settings/keyboard", async ({ request, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = (body as { preferences?: unknown } | null)?.preferences;
      if (input === undefined) return status(400, INVALID);
      try { return { preferences: await store.saveKeyboard(userId, input) }; }
      catch (error) {
        if (error instanceof KeyboardPreferencesError) return status(400, { code: "INVALID_INPUT", message: error.message });
        throw error;
      }
    });
}
