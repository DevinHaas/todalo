// Task → Google Calendar writes, shared by the legacy Server Actions and the API.
// Server-only. googleapis and the auth instance load lazily so importing task
// operations (and their tests) never constructs a provider client up front.
import { format } from "date-fns";
import type { calendar_v3 } from "googleapis";

export interface CalendarTask {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  googleCalendarEventId: string | null;
}

async function getCalendarClient(userId: string) {
  const [{ google }, { auth }] = await Promise.all([import("googleapis"), import("@todalo/auth")]);
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "google", userId },
  });
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// One-way push only: task -> calendar event. Never reads back edits made in
// Google Calendar. Two-way sync is a natural next contribution, not built here.
export async function pushTaskToCalendar(userId: string, task: CalendarTask) {
  try {
    const calendar = await getCalendarClient(userId);

    if (!task.dueDate) {
      if (task.googleCalendarEventId) {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: task.googleCalendarEventId,
        });
      }
      return { googleCalendarEventId: null };
    }

    // dueDate is a calendar day, not a point in time — use its local date
    // components (not toISOString, which reads the UTC day and is off by
    // one for any timezone ahead of UTC). All-day events also need an
    // exclusive end date, i.e. the day after.
    const startDate = format(task.dueDate, "yyyy-MM-dd");
    const endDate = format(
      new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate() + 1),
      "yyyy-MM-dd",
    );
    const event = {
      summary: task.title,
      description: task.description ?? undefined,
      start: { date: startDate },
      end: { date: endDate },
    };

    return { googleCalendarEventId: await upsertEvent(calendar, task.googleCalendarEventId, event) };
  } catch (err) {
    console.error("Google Calendar sync failed for task", task.id, err);
    return null;
  }
}

type CalendarClient = Awaited<ReturnType<typeof getCalendarClient>>;

/** Updates the event when there is one, otherwise inserts it; the event's ID. */
async function upsertEvent(calendar: CalendarClient, eventId: string | null, event: calendar_v3.Schema$Event) {
  if (eventId) {
    await calendar.events.update({ calendarId: "primary", eventId, requestBody: event });
    return eventId;
  }
  const { data } = await calendar.events.insert({ calendarId: "primary", requestBody: event });
  return data.id ?? null;
}

export interface CalendarBlock { id: string; summary: string; start: Date; end: Date; googleCalendarEventId: string | null }

/**
 * Goals ticket 10: a time block as a timed event on the primary calendar, the
 * same push as tasks (null when Google is unlinked or fails; the block stays).
 * Deleting its event is deleteTaskFromCalendar, which takes any event ID.
 */
export async function pushBlockToCalendar(userId: string, block: CalendarBlock) {
  try {
    const calendar = await getCalendarClient(userId);
    const event = { summary: block.summary, start: { dateTime: block.start.toISOString() }, end: { dateTime: block.end.toISOString() } };
    return { googleCalendarEventId: await upsertEvent(calendar, block.googleCalendarEventId, event) };
  } catch (err) {
    console.error("Google Calendar sync failed for time block", block.id, err);
    return null;
  }
}

export async function deleteTaskFromCalendar(userId: string, googleCalendarEventId: string) {
  try {
    const calendar = await getCalendarClient(userId);
    await calendar.events.delete({ calendarId: "primary", eventId: googleCalendarEventId });
  } catch (err) {
    console.error("Google Calendar delete failed for event", googleCalendarEventId, err);
  }
}
