import { Elysia } from "elysia";
import type { SyncDelta } from "@todalo/server/sync-delta";

export interface SyncStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  delta(userId: string, since: string | null): Promise<SyncDelta>;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;

/** GET /api/v1/sync?since=<cursor>: the incremental delta (contract in packages/server/src/sync-delta.ts). */
export function createSyncRoutes(store: SyncStore) {
  return new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .get("/sync", async ({ request, query, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return store.delta(userId, typeof query.since === "string" ? query.since : null);
    });
}
