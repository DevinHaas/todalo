// Google Calendar → local event cache sync, watch channels and webhook handling,
// moved from apps/web/lib/google-calendar-sync.ts (legacy semantics unchanged).
// Server-only: provider access tokens come from Better Auth's account store and
// never leave this module. googleapis and the auth instance load lazily (as in
// calendar.ts) so importing this module constructs no provider client.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { calendar_v3 } from "googleapis";
import { db } from "@todalo/db";
import { account, calendarEvents, syncedCalendars, tasks } from "@todalo/db/schema";
import { inboundPatch, listEventChanges } from "./calendar-inbound";

type SyncedCalendar = typeof syncedCalendars.$inferSelect;

const SYNC_DEBOUNCE_MS = 15_000;
const CHANNEL_RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
/** The callback path existing Google channels were registered with; kept for compatibility. */
export const WEBHOOK_PATH = "/api/calendar/webhook";

/**
 * Provider errors (gaxios) carry the request config, including the bearer
 * header, so only the status code and message are ever logged.
 */
export function logSafe(message: string, id: string, error: unknown) {
  const { code, message: detail } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.error(message, id, { code, message: typeof detail === "string" ? detail.slice(0, 200) : undefined });
}

// `accountId` here is our internal `account.id` (what syncedCalendars/etc.
// FK against). better-auth's getAccessToken wants the *provider's* external
// account id (`account.accountId`) to disambiguate multiple linked Google
// accounts, so we translate at this one boundary.
async function getCalendarClientForAccount(userId: string, accountId: string) {
  const [acct] = await db.select().from(account).where(and(eq(account.id, accountId), eq(account.userId, userId)));
  if (!acct) throw new Error("Account not found");
  const [{ google }, { auth }] = await Promise.all([import("googleapis"), import("@todalo/auth")]);
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: acct.providerId, userId, accountId: acct.accountId },
  });
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function listGoogleCalendars(userId: string, accountId: string) {
  const calendar = await getCalendarClientForAccount(userId, accountId);
  const { data } = await calendar.calendarList.list();
  return (data.items ?? []).map((c) => ({
    id: c.id!,
    summary: c.summaryOverride ?? c.summary ?? c.id!,
    color: c.backgroundColor ?? "#4285f4",
    primary: c.primary ?? false,
  }));
}

type CalendarClient = Awaited<ReturnType<typeof getCalendarClientForAccount>>;

// Full or incremental sync of one calendar (listing in calendar-inbound.ts).
// Full sync (no syncToken) expands recurring events over a rolling window;
// incremental sync only fetches what changed. An expired token (410) drops
// the cache and resyncs in full at once. A `tasksOnly` row caches nothing:
// its changes flow back into the tasks pushed to that calendar.
export async function syncCalendar(cal: SyncedCalendar, client?: Pick<CalendarClient, "events">): Promise<{ changed: boolean }> {
  const calendar = client ?? await getCalendarClientForAccount(cal.userId, cal.accountId);
  const { items, nextSyncToken, reset } = await listEventChanges((params) => calendar.events.list(params), cal.googleCalendarId, cal.syncToken ?? null);
  let changed = reset;
  if (cal.tasksOnly) changed = await applyTaskEvents(cal.userId, items);
  else {
    if (reset) await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, cal.id));
    for (const event of items) {
      if (!event.id || event.eventType === "workingLocation") continue;

      if (event.status === "cancelled") {
        await db
          .delete(calendarEvents)
          .where(and(eq(calendarEvents.calendarId, cal.id), eq(calendarEvents.googleEventId, event.id)));
        changed = true;
        continue;
      }

      const startRaw = event.start?.dateTime ?? event.start?.date;
      const endRaw = event.end?.dateTime ?? event.end?.date;
      if (!startRaw || !endRaw) continue;

      const fields = {
        title: event.summary ?? "(no title)",
        start: new Date(startRaw),
        end: new Date(endRaw),
        allDay: !event.start?.dateTime,
        eventType: event.eventType ?? null,
        htmlLink: event.htmlLink ?? null,
      };
      await db
        .insert(calendarEvents)
        .values({ calendarId: cal.id, userId: cal.userId, googleEventId: event.id, ...fields })
        .onConflictDoUpdate({
          target: [calendarEvents.calendarId, calendarEvents.googleEventId],
          set: { ...fields, updatedAt: new Date() },
        });
      changed = true;
    }
  }

  await db.update(syncedCalendars).set({ syncToken: nextSyncToken, syncedAt: new Date() }).where(eq(syncedCalendars.id, cal.id));
  return { changed };
}

/**
 * Google → task (rules in calendar-inbound.ts): each listed event pushed from one
 * of the user's tasks updates that task. Written directly, never through
 * updateTask, so an inbound change is not pushed back to Google (no echo loop).
 */
export async function applyTaskEvents(userId: string, events: Pick<calendar_v3.Schema$Event, "id" | "status" | "summary" | "start" | "end" | "updated">[]) {
  const ids = events.flatMap((event) => event.id ? [event.id] : []);
  if (!ids.length) return false;
  const linked = await db.select().from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.googleCalendarEventId, ids)));
  let changed = false;
  for (const task of linked) {
    const event = events.find((item) => item.id === task.googleCalendarEventId)!;
    const patch = inboundPatch(task, event);
    if (!patch) continue;
    // Compare-and-set on the version the rule saw: an app edit landing meanwhile wins.
    const [written] = await db.update(tasks).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(tasks.id, task.id), eq(tasks.userId, userId), eq(tasks.updatedAt, task.updatedAt))).returning({ id: tasks.id });
    if (written) changed = true;
  }
  return changed;
}

/**
 * The calendar that tasks are pushed to (calendar.ts: the user's first Google
 * account, "primary") gets a tasks-only row, so its watch channel or polling
 * brings Google edits back. Needs the calendar scope; an existing row is kept.
 */
export async function ensureTaskCalendar(userId: string) {
  const [acct] = await db.select().from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google"))).orderBy(asc(account.createdAt)).limit(1);
  if (!acct?.scope?.includes("calendar")) return;
  const [existing] = await db.select({ id: syncedCalendars.id }).from(syncedCalendars)
    .where(and(eq(syncedCalendars.accountId, acct.id), eq(syncedCalendars.googleCalendarId, "primary"))).limit(1);
  if (existing) return;
  // The unique (account, calendar) index settles two first reads racing here.
  await db.insert(syncedCalendars)
    .values({ userId, accountId: acct.id, googleCalendarId: "primary", summary: "Tasks", color: "#4285f4", tasksOnly: true })
    .onConflictDoNothing();
}

export async function stopWatchChannel(cal: SyncedCalendar) {
  if (!cal.channelId || !cal.resourceId) return;
  try {
    const calendar = await getCalendarClientForAccount(cal.userId, cal.accountId);
    await calendar.channels.stop({ requestBody: { id: cal.channelId, resourceId: cal.resourceId } });
  } catch (err) {
    logSafe("Failed to stop watch channel", cal.id, err);
  }
  await db.update(syncedCalendars).set({ channelId: null, resourceId: null, channelExpiresAt: null }).where(eq(syncedCalendars.id, cal.id));
}

// Registers (or renews) a Google push-notification channel for one calendar.
// Requires a public HTTPS callback: GOOGLE_WEBHOOK_BASE_URL + WEBHOOK_PATH must
// reach the process that also serves the live stream (see live.ts). In dev,
// point it at a tunnel to that process.
export async function ensureWatchChannel(cal: SyncedCalendar) {
  const webhookBase = process.env.GOOGLE_WEBHOOK_BASE_URL;
  if (!webhookBase) return;
  if (cal.channelExpiresAt && cal.channelExpiresAt.getTime() > Date.now() + CHANNEL_RENEW_THRESHOLD_MS) return;

  if (cal.channelId && cal.resourceId) await stopWatchChannel(cal);

  const calendar = await getCalendarClientForAccount(cal.userId, cal.accountId);
  const channelId = crypto.randomUUID();
  const { data } = await calendar.events.watch({
    calendarId: cal.googleCalendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${webhookBase}${WEBHOOK_PATH}`,
      // Verified against the DB row in the webhook handler so an attacker
      // can't spoof notifications for a calendar they don't own.
      token: cal.id,
    },
  });

  await db
    .update(syncedCalendars)
    .set({
      channelId: data.id ?? channelId,
      resourceId: data.resourceId ?? null,
      channelExpiresAt: data.expiration ? new Date(Number(data.expiration)) : null,
    })
    .where(eq(syncedCalendars.id, cal.id));
}

// Entry point called (fire-and-forget) from event reads. Syncs any calendar
// that's due, renews channels nearing expiration (forcing a full resync first,
// to roll the sync window), and catches up anything missed while the webhook
// was unreachable. Debounced per-calendar via syncedAt so concurrent reads
// don't hammer Google.
export async function ensureCalendarSync(userId: string): Promise<{ changed: boolean }> {
  await ensureTaskCalendar(userId);
  // Without a webhook URL there are no channels to renew (polling instead, below),
  // so a missing channel must not force a full resync on every read.
  const watching = Boolean(process.env.GOOGLE_WEBHOOK_BASE_URL);
  const cals = await db.select().from(syncedCalendars).where(and(eq(syncedCalendars.userId, userId), eq(syncedCalendars.enabled, true)));

  let changed = false;
  for (const cal of cals) {
    const debounced = cal.syncedAt && Date.now() - cal.syncedAt.getTime() < SYNC_DEBOUNCE_MS;
    if (debounced) continue;

    const channelStale = watching && (!cal.channelExpiresAt || cal.channelExpiresAt.getTime() < Date.now() + CHANNEL_RENEW_THRESHOLD_MS);

    let toSync = cal;
    if (channelStale && cal.syncToken) {
      await db.update(syncedCalendars).set({ syncToken: null }).where(eq(syncedCalendars.id, cal.id));
      toSync = { ...cal, syncToken: null };
    }

    const result = await syncCalendar(toSync).catch((err) => {
      logSafe("syncCalendar failed", cal.id, err);
      return { changed: false };
    });
    if (result.changed) changed = true;

    if (channelStale) {
      const [fresh] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, cal.id));
      if (fresh) await ensureWatchChannel(fresh).catch((err) => logSafe("ensureWatchChannel failed", cal.id, err));
    }
  }
  return { changed };
}

/**
 * Google's push-notification callback (both hosts serve it at WEBHOOK_PATH).
 * The channel token is the syncedCalendars.id, verified against the stored
 * channel/resource IDs so a guessed token can't trigger a sync for a calendar
 * an attacker doesn't own. Returns the owner to notify after a sync attempt.
 */
export async function handleCalendarWebhook(headers: Headers): Promise<{ status: 200 | 404; userId?: string }> {
  const channelId = headers.get("x-goog-channel-id");
  const resourceId = headers.get("x-goog-resource-id");
  const token = headers.get("x-goog-channel-token");
  if (!channelId || !resourceId || !token) return { status: 404 };

  const [cal] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, token));
  if (!cal || cal.channelId !== channelId || cal.resourceId !== resourceId) return { status: 404 };

  // Initial handshake sent when the channel is created — no event data yet.
  if (headers.get("x-goog-resource-state") === "sync") return { status: 200 };

  try {
    await syncCalendar(cal);
    return { status: 200, userId: cal.userId };
  } catch (err) {
    // Still 200, as legacy: Google retries a failing callback with backoff otherwise.
    logSafe("Webhook-triggered sync failed", cal.id, err);
    return { status: 200 };
  }
}

/**
 * Keeps every user's calendars current without a client asking. With
 * GOOGLE_WEBHOOK_BASE_URL set, Google pushes changes to the webhook and this
 * only renews watch channels before they expire (hourly). Without it (local
 * dev) nothing can reach us, so it polls each calendar's syncToken instead.
 * `notify` gets the owner of anything that changed. Returns the stop function.
 */
export function startCalendarMaintenance(notify: (userId: string) => void) {
  const watching = Boolean(process.env.GOOGLE_WEBHOOK_BASE_URL);
  console.log(watching ? "Google Calendar: push notifications (webhook) with hourly channel renewal" : "Google Calendar: no GOOGLE_WEBHOOK_BASE_URL, polling syncTokens every 30 s");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const users = await db.selectDistinct({ userId: syncedCalendars.userId }).from(syncedCalendars).where(eq(syncedCalendars.enabled, true));
      for (const { userId } of users) {
        const { changed } = await ensureCalendarSync(userId).catch((err) => { logSafe("Calendar maintenance failed", userId, err); return { changed: false }; });
        if (changed) notify(userId);
      }
    } catch (err) {
      logSafe("Calendar maintenance failed", "all", err);
    } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), watching ? 60 * 60_000 : 30_000);
  return () => clearInterval(timer);
}
