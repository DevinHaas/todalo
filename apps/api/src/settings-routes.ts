import { Elysia } from "elysia";
import { settingsInput, type SettingsDto } from "@todalo/server/settings-input";
import { writeUser } from "./project-routes";

export interface SettingsStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session (CSRF). */
  allowedOrigins: ReadonlySet<string>;
  get(userId: string): Promise<SettingsDto>;
  setSmartDateRecognition(userId: string, enabled: boolean): Promise<SettingsDto>;
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
      const settings = await store.setSmartDateRecognition(userId, input.data.smartDateRecognition);
      return { settings: { smartDateRecognition: settings.smartDateRecognition } satisfies SettingsDto };
    });
}
