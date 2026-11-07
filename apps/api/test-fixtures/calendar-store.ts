// In-memory twin of @todalo/server/calendar-connections + calendar-sync for route
// tests and the isolated QA API: a stub "Google" (calendar lists and events per
// calendar) behind the same owner checks, visibility and echo filters, and the
// webhook channel verification. No provider credentials or network.
import type { CalendarEventRecord, CalendarStore } from "../src/calendar-routes";
import type { CalendarAccountDto } from "../../../packages/server/src/calendar-input";

export interface StubGoogleEvent { id: string; title: string; start: Date; end: Date; allDay?: boolean; htmlLink?: string }
export interface StubAccount {
  id: string; userId: string; email: string;
  /** The provider's calendar list; `null` models a missing or revoked calendar grant. */
  calendars: { id: string; summary: string; color: string }[] | null;
}
interface Synced { id: string; userId: string; accountId: string; googleCalendarId: string; summary: string; color: string; enabled: boolean; syncedAt: Date | null; channelId: string | null; resourceId: string | null }

export function memoryCalendarStore(options: {
  accounts: StubAccount[];
  /** Google's events per calendar id; edit it, then call `providerChanged`. */
  google: Map<string, StubGoogleEvent[]>;
  synced?: Omit<Synced, "channelId" | "resourceId" | "syncedAt">[];
  /** googleCalendarEventIds of tasks and time blocks the user pushed to Google (the echo filter). */
  ownEventIds?: Set<string>;
  subscribe: CalendarStore["subscribe"];
  publish: CalendarStore["publish"];
}) {
  const { accounts, google } = options;
  const ownEventIds = options.ownEventIds ?? new Set<string>();
  const synced: Synced[] = (options.synced ?? []).map(row => ({ ...row, syncedAt: null, channelId: null, resourceId: null }));
  const showEvents = new Map<string, boolean>();
  const cache = new Map<string, CalendarEventRecord & { googleEventId: string }>();
  let sequence = 0;
  const owned = (userId: string, accountId: string) => accounts.find(item => item.id === accountId && item.userId === userId) ?? null;

  function sync(cal: Synced) {
    for (const [key, event] of cache) if (key.startsWith(`${cal.id}:`)) cache.delete(key);
    for (const event of google.get(cal.googleCalendarId) ?? []) {
      cache.set(`${cal.id}:${event.id}`, { id: `${cal.id}:${event.id}`, googleEventId: event.id, title: event.title, start: event.start, end: event.end, allDay: event.allDay ?? false, htmlLink: event.htmlLink ?? null, color: cal.color });
    }
    cal.syncedAt = new Date();
  }
  const watch = (cal: Synced) => { cal.channelId = `channel-${++sequence}`; cal.resourceId = `resource-${cal.googleCalendarId}`; };
  const unwatch = (cal: Synced) => { for (const key of [...cache.keys()]) if (key.startsWith(`${cal.id}:`)) cache.delete(key); cal.channelId = cal.resourceId = null; };
  for (const cal of synced) if (cal.enabled) { sync(cal); watch(cal); }

  const store: Omit<CalendarStore, "verify" | "allowedOrigins"> = {
    subscribe: options.subscribe,
    publish: options.publish,
    async events(userId) {
      return [...cache.values()]
        .filter(event => {
          const cal = synced.find(row => event.id.startsWith(`${row.id}:`));
          return cal && cal.userId === userId && cal.enabled && (showEvents.get(cal.accountId) ?? true) && !ownEventIds.has(event.googleEventId);
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map(({ googleEventId: _, ...event }) => event);
    },
    async accounts(userId) {
      return accounts.filter(item => item.userId === userId).map((acct): CalendarAccountDto => {
        const rows = synced.filter(row => row.accountId === acct.id);
        return {
          id: acct.id, email: acct.email, needsConsent: acct.calendars === null,
          hasSyncError: rows.some(row => row.enabled && !row.syncedAt), showEvents: showEvents.get(acct.id) ?? true,
          calendars: (acct.calendars ?? []).map(cal => {
            const row = rows.find(item => item.googleCalendarId === cal.id);
            return { id: cal.id, summary: cal.summary, color: row?.color ?? cal.color, enabled: row?.enabled ?? false };
          }),
        };
      });
    },
    async setShowEvents(userId, accountId, show) {
      if (!owned(userId, accountId)) return false;
      showEvents.set(accountId, show);
      return true;
    },
    async setVisible(userId, accountId, input) {
      if (!owned(userId, accountId)) return false;
      let row = synced.find(item => item.accountId === accountId && item.googleCalendarId === input.googleCalendarId);
      if (!row) synced.push(row = { id: `synced-${++sequence}`, userId, accountId, googleCalendarId: input.googleCalendarId, summary: input.summary, color: input.color, enabled: input.visible, syncedAt: null, channelId: null, resourceId: null });
      Object.assign(row, { enabled: input.visible, summary: input.summary, color: input.color });
      if (input.visible) { sync(row); watch(row); } else unwatch(row);
      return true;
    },
    async resync(userId, accountId) {
      if (!owned(userId, accountId)) return false;
      for (const row of synced) if (row.accountId === accountId && row.enabled) { sync(row); watch(row); }
      return true;
    },
    async disconnect(userId, accountId) {
      if (!owned(userId, accountId)) return false;
      for (const row of synced.filter(item => item.accountId === accountId)) { unwatch(row); synced.splice(synced.indexOf(row), 1); }
      showEvents.delete(accountId);
      accounts.splice(accounts.findIndex(item => item.id === accountId), 1);
      return true;
    },
    async webhook(headers) {
      const cal = synced.find(row => row.id === headers.get("x-goog-channel-token"));
      if (!cal || !cal.channelId || cal.channelId !== headers.get("x-goog-channel-id") || cal.resourceId !== headers.get("x-goog-resource-id")) return { status: 404 };
      if (headers.get("x-goog-resource-state") === "sync") return { status: 200 };
      sync(cal);
      return { status: 200, userId: cal.userId };
    },
  };
  return {
    store,
    /** The headers Google would send for a change to this calendar, or null without a channel. */
    providerChanged(googleCalendarId: string) {
      const cal = synced.find(row => row.googleCalendarId === googleCalendarId && row.channelId);
      return cal ? new Headers({ "x-goog-channel-id": cal.channelId!, "x-goog-resource-id": cal.resourceId!, "x-goog-channel-token": cal.id, "x-goog-resource-state": "exists" }) : null;
    },
  };
}
