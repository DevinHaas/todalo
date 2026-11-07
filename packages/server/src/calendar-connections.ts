// Connected calendars, shared by the legacy settings page/Server Actions and
// /api/v1/calendar: event reads (with the visibility and echo filters), the
// account list, per-calendar and per-account visibility, resync and disconnect.
// Server-only. Callers authenticate first and pass the session's userId; a
// missing or foreign account is `false` (the API's 404), never another user's row.
import { and, eq, isNotNull, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@todalo/db";
import { account, calendarAccountSettings, calendarEvents, syncedCalendars, tasks } from "@todalo/db/schema";
import type { CalendarAccountDto, CalendarVisibilityInput } from "./calendar-input";
import { ensureCalendarSync, ensureWatchChannel, listGoogleCalendars, logSafe, stopWatchChannel, syncCalendar } from "./calendar-sync";

export async function getCalendarEventsForUser(userId: string) {
  // Fire-and-forget: keeps the local cache fresh without blocking the read.
  // The webhook + live stream handle the common case; this is the catch-up
  // path (first load, missed webhook, expired channel).
  ensureCalendarSync(userId).catch((err) => logSafe("ensureCalendarSync failed", userId, err));

  const ownGoogleEventIds = db
    .select({ id: tasks.googleCalendarEventId })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNotNull(tasks.googleCalendarEventId)));

  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      start: calendarEvents.start,
      end: calendarEvents.end,
      allDay: calendarEvents.allDay,
      htmlLink: calendarEvents.htmlLink,
      color: syncedCalendars.color,
    })
    .from(calendarEvents)
    .innerJoin(syncedCalendars, eq(calendarEvents.calendarId, syncedCalendars.id))
    .leftJoin(calendarAccountSettings, eq(syncedCalendars.accountId, calendarAccountSettings.accountId))
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(syncedCalendars.enabled, true),
        // No settings row yet means the account-level toggle defaults to on.
        or(isNull(calendarAccountSettings.showEvents), eq(calendarAccountSettings.showEvents, true)),
        // Echo filter: don't show events we pushed to Google ourselves.
        notInArray(calendarEvents.googleEventId, ownGoogleEventIds),
      ),
    )
    .orderBy(calendarEvents.start);
}

export type CalendarEvent = Awaited<ReturnType<typeof getCalendarEventsForUser>>[number];

async function ownedAccount(userId: string, accountId: string) {
  const [row] = await db.select().from(account).where(and(eq(account.id, accountId), eq(account.userId, userId)));
  return row ?? null;
}

/** The legacy settings page's account cards: each linked Google account and its calendars. */
export async function getCalendarAccounts(userId: string): Promise<CalendarAccountDto[]> {
  const googleAccounts = await db.select().from(account).where(and(eq(account.userId, userId), eq(account.providerId, "google")));
  return Promise.all(googleAccounts.map(async (acct) => {
    const [synced, [settings]] = await Promise.all([
      db.select().from(syncedCalendars).where(eq(syncedCalendars.accountId, acct.id)),
      db.select().from(calendarAccountSettings).where(eq(calendarAccountSettings.accountId, acct.id)),
    ]);
    const syncedById = new Map(synced.map((s) => [s.googleCalendarId, s]));
    let calendars: CalendarAccountDto["calendars"] = [];
    let needsConsent = false;
    try {
      calendars = (await listGoogleCalendars(userId, acct.id)).map((c) => {
        const existing = syncedById.get(c.id);
        return { id: c.id, summary: c.summary, color: existing?.color ?? c.color, enabled: existing?.enabled ?? false };
      });
    } catch {
      needsConsent = true;
    }
    return {
      id: acct.id,
      email: acct.accountId,
      needsConsent,
      hasSyncError: synced.some((s) => s.enabled && !s.tasksOnly && !s.syncedAt),
      showEvents: settings?.showEvents ?? true,
      calendars,
    };
  }));
}

/** One calendar's eye toggle: showing syncs it and opens a watch channel; hiding stops the channel and clears its cache. */
export async function setCalendarVisible(userId: string, accountId: string, data: CalendarVisibilityInput): Promise<boolean> {
  if (!await ownedAccount(userId, accountId)) return false;
  const [existing] = await db.select().from(syncedCalendars)
    .where(and(eq(syncedCalendars.accountId, accountId), eq(syncedCalendars.googleCalendarId, data.googleCalendarId)));

  const [row] = existing
    ? await db.update(syncedCalendars).set({ enabled: data.visible, summary: data.summary, color: data.color }).where(eq(syncedCalendars.id, existing.id)).returning()
    : await db.insert(syncedCalendars).values({ userId, accountId, googleCalendarId: data.googleCalendarId, summary: data.summary, color: data.color, enabled: data.visible }).returning();

  if (data.visible) {
    await syncCalendar(row);
    const [fresh] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, row.id));
    if (fresh) await ensureWatchChannel(fresh);
  } else {
    await stopWatchChannel(row);
    await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, row.id));
  }
  return true;
}

/** The account-level "Show events in Today/Upcoming" switch. */
export async function setAccountShowEvents(userId: string, accountId: string, show: boolean): Promise<boolean> {
  if (!await ownedAccount(userId, accountId)) return false;
  await db
    .insert(calendarAccountSettings)
    .values({ accountId, userId, showEvents: show })
    .onConflictDoUpdate({ target: calendarAccountSettings.accountId, set: { showEvents: show, updatedAt: new Date() } });
  return true;
}

/** Full resync of the account's visible calendars, renewing each watch channel. */
export async function resyncAccount(userId: string, accountId: string): Promise<boolean> {
  if (!await ownedAccount(userId, accountId)) return false;
  const cals = await db.select().from(syncedCalendars).where(and(eq(syncedCalendars.accountId, accountId), eq(syncedCalendars.enabled, true)));
  for (const cal of cals) {
    await db.update(syncedCalendars).set({ syncToken: null }).where(eq(syncedCalendars.id, cal.id));
    await syncCalendar({ ...cal, syncToken: null });
    const [afterSync] = await db.select().from(syncedCalendars).where(eq(syncedCalendars.id, cal.id));
    if (afterSync) await ensureWatchChannel(afterSync);
  }
  return true;
}

/**
 * Stops every watch channel, drops the account's calendar rows (events cascade)
 * and settings, then unlinks the Google account through Better Auth. `unlink`
 * runs with the caller's own session headers (cookie or bearer).
 */
export async function disconnectAccount(
  userId: string,
  accountId: string,
  unlink: (provider: { providerId: string; accountId: string }) => Promise<unknown>,
): Promise<boolean> {
  const acct = await ownedAccount(userId, accountId);
  if (!acct) return false;
  const cals = await db.select().from(syncedCalendars).where(eq(syncedCalendars.accountId, accountId));
  for (const cal of cals) await stopWatchChannel(cal);
  await db.delete(syncedCalendars).where(eq(syncedCalendars.accountId, accountId));
  await db.delete(calendarAccountSettings).where(eq(calendarAccountSettings.accountId, accountId));
  await unlink({ providerId: acct.providerId, accountId: acct.accountId });
  return true;
}
