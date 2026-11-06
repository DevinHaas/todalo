import { randomBytes } from "node:crypto";

// ponytail: process-local store; a multi-instance API needs a shared store
// (or a signed, replay-tracked ticket) before scaling past one process.
export function createSocketTickets({ ttlMs = 30_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {}) {
  const tickets = new Map<string, { userId: string; expiresAt: number }>();
  const sweep = (time: number) => {
    for (const [ticket, entry] of tickets) if (entry.expiresAt <= time) tickets.delete(ticket);
  };
  return {
    issue(userId: string) {
      const time = now();
      sweep(time);
      const ticket = randomBytes(32).toString("base64url");
      const expiresAt = time + ttlMs;
      tickets.set(ticket, { userId, expiresAt });
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    },
    /** Single use: a ticket is deleted on the first lookup, valid or expired. */
    consume(ticket: string): string | null {
      const entry = tickets.get(ticket);
      tickets.delete(ticket);
      return entry && entry.expiresAt > now() ? entry.userId : null;
    },
    size: () => tickets.size,
  };
}

export type SocketTickets = ReturnType<typeof createSocketTickets>;
