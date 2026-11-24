/**
 * A session lookup is ~2 database round trips (≈400 ms from the API to Neon). A token's
 * verified user is kept for `ttlMs`, and concurrent lookups for one token share one query, so a
 * page's burst of reads, and a write plus its after-response live publish, check the session once.
 *
 * Any /api/auth request carrying the token (sign-out, account deletion, session changes)
 * drops it first. ponytail: per-process Map; a session revoked from another device or process
 * keeps working on this one for up to `ttlMs`. Shorten the TTL if that window matters.
 */
export function sessionCache(verify: (headers: Headers) => Promise<string | null>, ttlMs = 30_000, now = () => Date.now(), limit = 10_000) {
  const entries = new Map<string, { at: number; userId: Promise<string | null> }>();
  const drop = (token: string, userId: Promise<string | null>) => { if (entries.get(token)?.userId === userId) entries.delete(token); };
  return {
    verify(headers: Headers): Promise<string | null> {
      const token = sessionToken(headers);
      if (!token) return verify(headers);
      const hit = entries.get(token);
      if (hit && now() - hit.at < ttlMs) return hit.userId;
      if (entries.size >= limit) entries.clear(); // ponytail: crude bound; an LRU if many sessions are active at once
      const userId = verify(headers);
      entries.set(token, { at: now(), userId });
      // Only a signed-in answer is kept: a rejected or failed lookup is asked again next time.
      userId.then(id => { if (id === null) drop(token, userId); }, () => drop(token, userId));
      return userId;
    },
    forget(headers: Headers) { const token = sessionToken(headers); if (token) entries.delete(token); },
    /** A lookup made elsewhere (the account read): the reads that follow it reuse its answer. */
    remember(headers: Headers, userId: string) { const token = sessionToken(headers); if (token) entries.set(token, { at: now(), userId: Promise.resolve(userId) }); },
  };
}

/** The native bearer token, or the browser's session cookie (any better-auth cookie prefix). */
export function sessionToken(headers: Headers): string | null {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return `bearer:${bearer}`;
  const cookie = headers.get("cookie")?.match(/(?:^|;\s*)[^=;\s]*session_token=([^;]+)/)?.[1];
  return cookie ? `cookie:${cookie}` : null;
}
