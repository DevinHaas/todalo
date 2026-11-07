// Two-way task sync, Google → task: what an edited event changes on the task it
// was pushed from, and the incremental event listing. Pure (the Google list call
// is passed in), so both are tested with fakes; calendar-sync.ts applies them.
//
// Conflict rule: last write wins by timestamp. An event edit applies only when
// Google's `updated` is newer than the task's `updatedAt`; an app edit made after
// it wins and is pushed back over it. Echoes of our own pushes carry the task's
// current values, so they change nothing (and inbound writes never push).
import { addDays, differenceInCalendarDays, format, parse } from "date-fns";
import type { calendar_v3 } from "googleapis";

export interface InboundTask { title: string; dueDate: Date | null; dueDateEnd: Date | null; updatedAt: Date }
export type InboundEvent = Pick<calendar_v3.Schema$Event, "id" | "status" | "summary" | "start" | "end" | "updated">;
export interface TaskPatch { title?: string; dueDate?: Date | null; dueDateEnd?: Date | null; googleCalendarEventId?: null }

// The push's day format (calendar.ts): a due date's local day in the server's zone.
const day = (date: Date) => format(date, "yyyy-MM-dd");
const midnight = (value: string) => parse(value, "yyyy-MM-dd", new Date());
const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** The task fields an event edit changes; null when nothing applies (echo, older edit, no change). */
export function inboundPatch(task: InboundTask, event: InboundEvent): TaskPatch | null {
  if (event.updated && new Date(event.updated).getTime() <= task.updatedAt.getTime()) return null;
  // Deleted in Google: the task stays and is unscheduled (deleting the task from a calendar edit would lose it).
  if (event.status === "cancelled") return { dueDate: null, dueDateEnd: null, googleCalendarEventId: null };
  const patch: TaskPatch = {};
  const title = event.summary?.trim();
  if (title && title !== task.title) patch.title = title;
  const startTime = event.start?.dateTime, endTime = event.end?.dateTime, startDay = event.start?.date;
  if (startTime && endTime) {
    const start = new Date(startTime), end = new Date(endTime);
    if (!same(start, task.dueDate)) patch.dueDate = start;
    if (!same(end, task.dueDateEnd)) patch.dueDateEnd = end;
  } else if (startDay) {
    // An all-day task keeps its stored time of day and moves by whole days, so the push's
    // local-day mapping round-trips exactly; a timed task moved to all day becomes all-day.
    const dueDate = task.dueDate && !task.dueDateEnd
      ? addDays(task.dueDate, differenceInCalendarDays(midnight(startDay), midnight(day(task.dueDate))))
      : midnight(startDay);
    if (!same(dueDate, task.dueDate)) patch.dueDate = dueDate;
    if (task.dueDateEnd) patch.dueDateEnd = null;
  }
  return Object.keys(patch).length ? patch : null;
}

type ListEvents = (params: calendar_v3.Params$Resource$Events$List) => Promise<{ data: calendar_v3.Schema$Events }>;
export interface EventChanges { items: calendar_v3.Schema$Event[]; nextSyncToken: string | null; reset: boolean }

const SYNC_WINDOW_PAST_DAYS = 60;
const SYNC_WINDOW_FUTURE_DAYS = 400;

/**
 * Every page of a calendar's changes: incremental with a syncToken, otherwise a
 * full listing over the rolling window. An expired token (410) restarts as a full
 * listing at once; `reset` tells the caller to drop what it cached from the old token.
 */
export async function listEventChanges(list: ListEvents, calendarId: string, syncToken: string | null, now = Date.now()): Promise<EventChanges> {
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = syncToken;
  try {
    do {
      const { data } = await list({
        calendarId, singleEvents: true, maxResults: 250, pageToken,
        ...(syncToken ? { syncToken } : {
          timeMin: new Date(now - SYNC_WINDOW_PAST_DAYS * 86_400_000).toISOString(),
          timeMax: new Date(now + SYNC_WINDOW_FUTURE_DAYS * 86_400_000).toISOString(),
        }),
      });
      items.push(...data.items ?? []);
      pageToken = data.nextPageToken ?? undefined;
      if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
    } while (pageToken);
  } catch (error) {
    if (syncToken && (error as { code?: number })?.code === 410) return { ...await listEventChanges(list, calendarId, null, now), reset: true };
    throw error;
  }
  return { items, nextSyncToken, reset: false };
}
