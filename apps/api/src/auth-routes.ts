import { Elysia } from "elysia";
import type { createSessionAuth } from "../../../packages/auth/src/config";

type SessionAuth = ReturnType<typeof createSessionAuth>;
type Membership = { number: number; since: string; founding: boolean };

/**
 * `membership` adds the member badge's number and join date to the account (omitted when absent).
 * `sessions` (the API's session cache): every better-auth request drops its token, and the
 * account read, the first request of a launch, primes it for the reads that follow.
 */
export function createAuthRoutes(auth: SessionAuth, membership?: (userId: string) => Promise<Membership | null>, sessions?: { forget(headers: Headers): void; remember(headers: Headers, userId: string): void }) {
  const onAuthRequest = sessions?.forget;
  return new Elysia()
    // Before and after: a lookup racing a sign-out cannot keep the old answer.
    .mount(onAuthRequest ? async (request: Request) => { onAuthRequest(request.headers); try { return await auth.handler(request); } finally { onAuthRequest(request.headers); } } : auth.handler)
    .get("/api/v1/account", async ({ request, status, set }) => {
      set.headers["cache-control"] = "no-store";
      const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
      if (!session) return status(401, { code: "UNAUTHENTICATED", message: "Please sign in again." });
      sessions?.remember(request.headers, session.user.id);
      const { id, name, email, image, emailVerified } = session.user;
      const member = await membership?.(id).catch(() => null);
      return { user: { id, name, email, image: image ?? null, emailVerified }, expiresAt: session.session.expiresAt.toISOString(), ...(member ? { member } : {}) };
    });
}
