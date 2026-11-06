// Connected calendars for the isolated QA API (ticket 20): a stub Google with two
// calendars for the seed user and one for the other user, behind the real
// calendar routes (webhook verification and live stream included).
// POST /api/qa/calendar/provider-change adds an event in "Google" and delivers
// the push notification Google would send, through the real webhook path.
import { createCalendarRoutes } from "../../api/src/calendar-routes";
import { memoryCalendarStore, type StubGoogleEvent } from "../../api/test-fixtures/calendar-store";
import { publish, subscribe } from "../../../packages/server/src/live";

export function qaCalendarRoutes({ verify, allowedOrigins, userId, otherId, day }: {
  verify(headers: Headers): Promise<string | null>; allowedOrigins: ReadonlySet<string>; userId: string; otherId: string;
  day(offset: number, hours?: number, minutes?: number): Date;
}) {
  const allDay = (offset: number) => { const start = day(offset); return new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())); };
  const link = (id: string) => `https://www.google.com/calendar/event?eid=${id}`;
  const google = new Map<string, StubGoogleEvent[]>([
    ["qa-work@group.calendar.google.com", [
      { id: "qa-standup", title: "Team standup (Google)", start: day(0, 10), end: day(0, 10, 30), htmlLink: link("qa-standup") },
      { id: "qa-review", title: "Design review (Google)", start: day(1, 15), end: day(1, 16), htmlLink: link("qa-review") },
      { id: "qa-pushed", title: "Echo of a pushed task", start: day(0, 11), end: day(0, 11, 30) },
    ]],
    ["existing@example.test", [
      { id: "qa-holiday", title: "Public holiday (Google)", start: allDay(0), end: allDay(1), allDay: true, htmlLink: link("qa-holiday") },
    ]],
    ["qa-other@example.test", [{ id: "qa-other", title: "Other user's event", start: day(0, 12), end: day(0, 13) }]],
  ]);
  const fixture = memoryCalendarStore({
    accounts: [
      { id: "qa-google", userId, email: "existing.google@example.test", calendars: [{ id: "existing@example.test", summary: "Personal", color: "#4285f4" }, { id: "qa-work@group.calendar.google.com", summary: "Work", color: "#0b8043" }, { id: "qa-birthdays", summary: "Birthdays", color: "#8e24aa" }] },
      { id: "qa-google-revoked", userId, email: "old.google@example.test", calendars: null },
      { id: "qa-other-google", userId: otherId, email: "other.google@example.test", calendars: [{ id: "qa-other@example.test", summary: "Other", color: "#d50000" }] },
    ],
    google,
    synced: [
      { id: "qa-cal-personal", userId, accountId: "qa-google", googleCalendarId: "existing@example.test", summary: "Personal", color: "#4285f4", enabled: true },
      { id: "qa-cal-work", userId, accountId: "qa-google", googleCalendarId: "qa-work@group.calendar.google.com", summary: "Work", color: "#0b8043", enabled: true },
      { id: "qa-cal-other", userId: otherId, accountId: "qa-other-google", googleCalendarId: "qa-other@example.test", summary: "Other", color: "#d50000", enabled: true },
    ],
    ownEventIds: new Set(["qa-pushed"]),
    subscribe, publish,
  });
  // Mounted apps get no Bun server handle (no idle-timeout override), so beat under Bun's 10 s.
  const routes = createCalendarRoutes({ ...fixture.store, verify, allowedOrigins, heartbeatMs: 5_000 });
  let changes = 0;
  return routes.post("/api/qa/calendar/provider-change", async () => {
    const start = new Date(Date.now() + 60 * 60_000);
    start.setSeconds(0, 0);
    google.get("qa-work@group.calendar.google.com")!.push({ id: `qa-change-${++changes}`, title: `Provider change ${changes} (Google)`, start, end: new Date(start.getTime() + 30 * 60_000), htmlLink: link(`qa-change-${changes}`) });
    const headers = fixture.providerChanged("qa-work@group.calendar.google.com");
    if (!headers) return new Response("The Work calendar is hidden, so Google would not notify.", { status: 409 });
    const response = await routes.handle(new Request("http://qa.local/api/calendar/webhook", { method: "POST", headers }));
    return { webhookStatus: response.status, change: changes };
  });
}
