import { and, eq, isNull, isNotNull, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, syncedCalendars, calendarAccountSettings, tasks } from "@/db/schema";
import { ensureCalendarSync } from "@/lib/google-calendar-sync";

export async function getCalendarEventsForUser(userId: string) {
  // Fire-and-forget: keeps the local cache fresh without blocking the page
  // render. The webhook + SSE path handles the common case; this is the
  // catch-up path (first load, missed webhook, expired channel).
  ensureCalendarSync(userId).catch((err) => console.error("ensureCalendarSync failed", userId, err));

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
