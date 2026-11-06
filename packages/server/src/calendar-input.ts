// Pure connected-calendar schemas, DTOs and the live-stream contract (zod only, client-safe).
import { z } from "zod";

/** A provider event as Today/Upcoming render it: read-only, opened through `htmlLink`. */
export interface CalendarEventDto {
  id: string;
  title: string;
  /** ISO instants; all-day events span local midnights as Google stored them. */
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  color: string;
}

/** One linked Google account on the settings screen. Never carries provider tokens. */
export interface CalendarAccountDto {
  id: string;
  /** The provider account id legacy showed as the account's label. */
  email: string;
  /** Calendar access was not granted (or the grant was revoked): offer relinking. */
  needsConsent: boolean;
  hasSyncError: boolean;
  showEvents: boolean;
  calendars: { id: string; summary: string; color: string; enabled: boolean }[];
}

/** PATCH /api/v1/calendar/accounts/:id — the account-level "Show events" switch. */
export const accountShowEventsInput = z.object({ showEvents: z.boolean() }).strict();

/** PATCH /api/v1/calendar/accounts/:id/calendars — one calendar's eye toggle (legacy setCalendarVisible). */
export const calendarVisibilityInput = z.object({
  googleCalendarId: z.string().min(1).max(1024),
  summary: z.string().max(1024),
  // Rendered as an inline colour, so only the hex form Google returns is accepted.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  visible: z.boolean(),
}).strict();
export type CalendarVisibilityInput = z.infer<typeof calendarVisibilityInput>;

/**
 * Live stream contract, GET /api/v1/stream (text/event-stream). Ticket 22 extends it.
 * - `event: ready` once per connection: the client refetches every live topic,
 *   since changes may have been missed while it was disconnected or suspended.
 * - `event: change` with `data: {"topic": LiveTopic}` after a server-side change.
 * - `: heartbeat` comments keep idle proxies from closing the connection.
 * Clients ignore topics they do not know, so the server can add topics first.
 */
export const liveTopics = ["calendar"] as const;
export type LiveTopic = (typeof liveTopics)[number];
export const liveChange = z.object({ topic: z.string() });
