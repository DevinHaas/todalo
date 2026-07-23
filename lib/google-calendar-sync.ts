import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { syncedCalendars, calendarEvents, account } from "@/db/schema";
import { auth } from "@/lib/auth";

type SyncedCalendar = typeof syncedCalendars.$inferSelect;

const SYNC_WINDOW_PAST_DAYS = 60;
const SYNC_WINDOW_FUTURE_DAYS = 400;
const SYNC_DEBOUNCE_MS = 15_000;
const CHANNEL_RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// `accountId` here is our internal `account.id` (what syncedCalendars/etc.
// FK against). better-auth's getAccessToken wants the *provider's* external
// account id (`account.accountId`) to disambiguate multiple linked Google
// accounts, so we translate at this one boundary.
async function getCalendarClientForAccount(userId: string, accountId: string) {
  const [acct] = await db.select().from(account).where(eq(account.id, accountId));
  if (!acct) throw new Error(`Account not found: ${accountId}`);

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

// Full or incremental sync of one calendar's events into the local cache.
// Full sync (no syncToken) expands recurring events over a rolling window;
// incremental sync (syncToken present) only fetches what changed. On a 410
// (expired/invalid token) we drop the cache and force the next call back to
// a full sync.
export async function syncCalendar(cal: SyncedCalendar): Promise<{ changed: boolean }> {
  const calendar = await getCalendarClientForAccount(cal.userId, cal.accountId);
  const isFullSync = !cal.syncToken;

  let pageToken: string | undefined;
  let nextSyncToken: string | null = cal.syncToken ?? null;
  let changed = false;

  try {
    do {
      const { data } = await calendar.events.list({
        calendarId: cal.googleCalendarId,
        singleEvents: true,
        maxResults: 250,
        pageToken,
        ...(isFullSync
          ? {
              timeMin: new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86_400_000).toISOString(),
              timeMax: new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86_400_000).toISOString(),
            }
          : { syncToken: cal.syncToken! }),
      });

      for (const event of data.items ?? []) {
        if (!event.id || event.eventType === "workingLocation") continue;

        if (event.status === "cancelled") {
          await db
            .delete(calendarEvents)
            .where(
              and(eq(calendarEvents.calendarId, cal.id), eq(calendarEvents.googleEventId, event.id)),
            );
          changed = true;
          continue;
        }

        const startRaw = event.start?.dateTime ?? event.start?.date;
        const endRaw = event.end?.dateTime ?? event.end?.date;
        if (!startRaw || !endRaw) continue;

        await db
          .insert(calendarEvents)
          .values({
            calendarId: cal.id,
            userId: cal.userId,
            googleEventId: event.id,
            title: event.summary ?? "(no title)",
            start: new Date(startRaw),
            end: new Date(endRaw),
            allDay: !event.start?.dateTime,
            eventType: event.eventType ?? null,
            htmlLink: event.htmlLink ?? null,
          })
          .onConflictDoUpdate({
            target: [calendarEvents.calendarId, calendarEvents.googleEventId],
            set: {
              title: event.summary ?? "(no title)",
              start: new Date(startRaw),
              end: new Date(endRaw),
              allDay: !event.start?.dateTime,
              eventType: event.eventType ?? null,
              htmlLink: event.htmlLink ?? null,
              updatedAt: new Date(),
            },
          });
        changed = true;
      }

      pageToken = data.nextPageToken ?? undefined;
      if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    } while (pageToken);
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 410) {
      await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, cal.id));
      await db
        .update(syncedCalendars)
        .set({ syncToken: null, syncedAt: new Date() })
        .where(eq(syncedCalendars.id, cal.id));
      return { changed: true };
    }
    throw err;
  }

  await db
    .update(syncedCalendars)
    .set({ syncToken: nextSyncToken, syncedAt: new Date() })
    .where(eq(syncedCalendars.id, cal.id));
  return { changed };
}

export async function stopWatchChannel(cal: SyncedCalendar) {
  if (!cal.channelId || !cal.resourceId) return;
  try {
    const calendar = await getCalendarClientForAccount(cal.userId, cal.accountId);
    await calendar.channels.stop({ requestBody: { id: cal.channelId, resourceId: cal.resourceId } });
  } catch (err) {
    console.error("Failed to stop watch channel", cal.id, err);
  }
  await db
    .update(syncedCalendars)
    .set({ channelId: null, resourceId: null, channelExpiresAt: null })
    .where(eq(syncedCalendars.id, cal.id));
}

// Registers (or renews) a Google push-notification channel for one
// calendar. Requires a public HTTPS callback URL — in dev, point
// GOOGLE_WEBHOOK_BASE_URL at an ngrok tunnel to this app.
export async function ensureWatchChannel(cal: SyncedCalendar) {
  const webhookBase = process.env.GOOGLE_WEBHOOK_BASE_URL;
  if (!webhookBase) return;
  if (cal.channelExpiresAt && cal.channelExpiresAt.getTime() > Date.now() + CHANNEL_RENEW_THRESHOLD_MS) {
    return;
  }

  if (cal.channelId && cal.resourceId) {
    await stopWatchChannel(cal);
  }

  const calendar = await getCalendarClientForAccount(cal.userId, cal.accountId);
  const channelId = crypto.randomUUID();
  const { data } = await calendar.events.watch({
    calendarId: cal.googleCalendarId,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: `${webhookBase}/api/calendar/webhook`,
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

// Entry point called (fire-and-forget) from page loads and the webhook
// handler. Syncs any calendar that's due, renews channels nearing
// expiration (forcing a full resync first, to roll the sync window), and
// catches up anything missed while the webhook tunnel was down. Debounced
// per-calendar via syncedAt so concurrent page loads don't hammer Google.
export async function ensureCalendarSync(userId: string): Promise<{ changed: boolean }> {
  const cals = await db
    .select()
    .from(syncedCalendars)
    .where(and(eq(syncedCalendars.userId, userId), eq(syncedCalendars.enabled, true)));

  let changed = false;

  for (const cal of cals) {
    const debounced = cal.syncedAt && Date.now() - cal.syncedAt.getTime() < SYNC_DEBOUNCE_MS;
    if (debounced) continue;

    const channelStale =
      !cal.channelExpiresAt || cal.channelExpiresAt.getTime() < Date.now() + CHANNEL_RENEW_THRESHOLD_MS;

    let toSync = cal;
    if (channelStale && cal.syncToken) {
      await db.update(syncedCalendars).set({ syncToken: null }).where(eq(syncedCalendars.id, cal.id));
      toSync = { ...cal, syncToken: null };
    }

    const result = await syncCalendar(toSync).catch((err) => {
      console.error("syncCalendar failed", cal.id, err);
      return { changed: false };
    });
    if (result.changed) changed = true;

    if (channelStale) {
      const [fresh] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, cal.id));
      if (fresh) {
        await ensureWatchChannel(fresh).catch((err) =>
          console.error("ensureWatchChannel failed", cal.id, err),
        );
      }
    }
  }

  return { changed };
}
