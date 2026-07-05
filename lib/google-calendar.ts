import { google } from "googleapis";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import type { Task } from "@/lib/tasks";

async function getCalendarClient(userId: string) {
  const { accessToken } = await auth.api.getAccessToken({
    body: { providerId: "google", userId },
  });
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

// One-way push only: task -> calendar event. Never reads back edits made in
// Google Calendar. Two-way sync is a natural next contribution, not built here.
export async function pushTaskToCalendar(userId: string, task: Task) {
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

    if (task.googleCalendarEventId) {
      await calendar.events.update({
        calendarId: "primary",
        eventId: task.googleCalendarEventId,
        requestBody: event,
      });
      return { googleCalendarEventId: task.googleCalendarEventId };
    }

    const { data } = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });
    return { googleCalendarEventId: data.id ?? null };
  } catch (err) {
    console.error("Google Calendar sync failed for task", task.id, err);
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
