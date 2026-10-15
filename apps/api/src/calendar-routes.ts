import { Elysia } from "elysia";
import {
  accountShowEventsInput, calendarVisibilityInput,
  type CalendarAccountDto, type CalendarEventDto, type CalendarVisibilityInput, type LiveTopic,
} from "@todalo/server/calendar-input";
import { writeUser } from "./project-routes";

/** A cached provider event row as packages/server reads it (dates as Date). */
export interface CalendarEventRecord { id: string; title: string; start: Date; end: Date; allDay: boolean; htmlLink: string | null; color: string }

export interface CalendarStore {
  /** Resolves the session user from cookies (browser) or bearer token (native). */
  verify(headers: Headers): Promise<string | null>;
  /** Browser origins allowed to write with an ambient cookie session (CSRF). */
  allowedOrigins: ReadonlySet<string>;
  events(userId: string): Promise<CalendarEventRecord[]>;
  accounts(userId: string): Promise<CalendarAccountDto[]>;
  /** Each write is false for a missing or foreign account (404). */
  setShowEvents(userId: string, accountId: string, show: boolean): Promise<boolean>;
  setVisible(userId: string, accountId: string, input: CalendarVisibilityInput): Promise<boolean>;
  resync(userId: string, accountId: string): Promise<boolean>;
  /** `session` holds only the caller's auth header(s), for Better Auth's unlink. */
  disconnect(userId: string, accountId: string, session: Headers): Promise<boolean>;
  /** Google push callback; returns the calendar owner to notify. */
  webhook(headers: Headers): Promise<{ status: 200 | 404; userId?: string }>;
  subscribe(userId: string, listener: (topic: LiveTopic) => void): () => void;
  publish(userId: string, topic: LiveTopic): void;
  heartbeatMs?: number;
}

const UNAUTHENTICATED = { code: "UNAUTHENTICATED", message: "Please sign in again." } as const;
const FORBIDDEN = { code: "FORBIDDEN_ORIGIN", message: "This request was not sent by todalo." } as const;
const INVALID = { code: "INVALID_INPUT", message: "Check your entry and try again." } as const;
const NOT_FOUND = { code: "NOT_FOUND", message: "This calendar account does not exist or you do not have access to it." } as const;
const SAVE_FAILED = { code: "SAVE_FAILED", message: "Your changes could not be saved. Try again." } as const;

export const toCalendarEventDto = (event: CalendarEventRecord): CalendarEventDto => ({
  id: event.id, title: event.title, start: event.start.toISOString(), end: event.end.toISOString(),
  allDay: event.allDay, htmlLink: event.htmlLink, color: event.color,
});

/** Only the header that authenticated the request: bearer wins and cookies are then ignored. */
const sessionHeaders = (request: Request) => {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return new Headers({ authorization });
  const cookie = request.headers.get("cookie");
  return new Headers(cookie ? { cookie } : {});
};

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Connected calendars (ticket 20), the Google webhook and the live stream. */
export function createCalendarRoutes(store: CalendarStore) {
  const heartbeatMs = store.heartbeatMs ?? 25_000;
  // Provider failures (revoked grant, Google down) are a failed save, not a crash.
  // Success also tells the user's other devices (legacy only refreshed the acting browser).
  async function write(userId: string, run: () => Promise<boolean>) {
    let found: boolean;
    try { found = await run(); } catch { return new Response(JSON.stringify(SAVE_FAILED), { status: 502, headers: json }); }
    if (!found) return new Response(JSON.stringify(NOT_FOUND), { status: 404, headers: json });
    store.publish(userId, "calendar");
    return { ok: true as const };
  }

  const api = new Elysia({ prefix: "/api/v1" })
    .onAfterHandle(({ set }) => { set.headers["cache-control"] = "no-store"; })
    .onError(({ code, status }) => code === "PARSE" ? status(400, INVALID) : undefined)
    .get("/calendar/events", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      return { events: (await store.events(userId)).map(toCalendarEventDto) };
    })
    .get("/calendar/accounts", async ({ request, status }) => {
      const userId = await store.verify(request.headers);
      if (!userId) return status(401, UNAUTHENTICATED);
      // Explicit fields: whatever the store returns, no token or row metadata leaves.
      return { accounts: (await store.accounts(userId)).map(({ id, email, needsConsent, hasSyncError, showEvents, calendars }) => ({
        id, email, needsConsent, hasSyncError, showEvents,
        calendars: calendars.map(({ id, summary, color, enabled }) => ({ id, summary, color, enabled })),
      })) satisfies CalendarAccountDto[] };
    })
    .patch("/calendar/accounts/:id", async ({ request, params, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = accountShowEventsInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return write(userId, () => store.setShowEvents(userId, params.id, input.data.showEvents));
    })
    .patch("/calendar/accounts/:id/calendars", async ({ request, params, body, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      const input = calendarVisibilityInput.safeParse(body);
      if (!input.success) return status(400, INVALID);
      return write(userId, () => store.setVisible(userId, params.id, input.data));
    })
    .post("/calendar/accounts/:id/resync", async ({ request, params, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return write(userId, () => store.resync(userId, params.id));
    })
    .delete("/calendar/accounts/:id", async ({ request, params, status }) => {
      const userId = await writeUser(store, request);
      if (userId === "forbidden") return status(403, FORBIDDEN);
      if (!userId) return status(401, UNAUTHENTICATED);
      return write(userId, () => store.disconnect(userId, params.id, sessionHeaders(request)));
    })
    // Live stream (contract in packages/server/src/calendar-input.ts). A GET read:
    // cookies (browser, same origin) or the bearer Rust attaches (native). No
    // CORS headers are sent, so another site cannot read a cookie stream.
    .get("/stream", async ({ request, server, status }) => {
      const userId = await store.verify(sessionHeaders(request));
      if (!userId) return status(401, UNAUTHENTICATED);
      server?.timeout(request, 0); // Bun's 10 s idle timeout would cut the stream between heartbeats.
      const encoder = new TextEncoder();
      let stop = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (text: string) => { try { controller.enqueue(encoder.encode(text)); } catch { stop(); } };
          const unsubscribe = store.subscribe(userId, (topic) => send(frame("change", { topic })));
          const heartbeat = setInterval(() => send(": heartbeat\n\n"), heartbeatMs);
          stop = () => { clearInterval(heartbeat); unsubscribe(); };
          // Elysia re-wraps streamed bodies, so a client disconnect may never reach
          // cancel(); the request's abort signal always fires (Bun) and cleans up.
          request.signal.addEventListener("abort", () => { stop(); try { controller.close(); } catch { /* already closed */ } });
          send(frame("ready", {}));
        },
        cancel() { stop(); },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
      });
    });

  // Google's callback keeps the legacy path, so channels registered by the Next
  // app stay valid once GOOGLE_WEBHOOK_BASE_URL routes this path to the API.
  return new Elysia().use(api).post("/api/calendar/webhook", async ({ request }) => {
    const outcome = await store.webhook(request.headers);
    if (outcome.userId) store.publish(outcome.userId, "calendar");
    return new Response(null, { status: outcome.status });
  });
}

const json = { "content-type": "application/json", "cache-control": "no-store" };
