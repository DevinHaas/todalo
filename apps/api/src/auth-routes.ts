import { Elysia } from "elysia";
import type { createSessionAuth } from "../../../packages/auth/src/config";

type SessionAuth = ReturnType<typeof createSessionAuth>;

export function createAuthRoutes(auth: SessionAuth) {
  return new Elysia()
    .mount(auth.handler)
    .get("/api/v1/account", async ({ request, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
      if (!session) return status(401, { code: "UNAUTHENTICATED", message: "Please sign in again." });
      const { id, name, email, image, emailVerified } = session.user;
      return { user: { id, name, email, image: image ?? null, emailVerified }, expiresAt: session.session.expiresAt.toISOString() };
    });
}
