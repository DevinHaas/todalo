import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { CalendarAccountDto, CalendarEventDto, CalendarVisibilityInput } from "../../../packages/server/src/calendar-input";
import { AccountTransportError, nativeAccountError, type AccountErrorCode } from "./errors";
import { dayKey } from "./schedule";

export type { CalendarAccountDto, CalendarEventDto, CalendarVisibilityInput };

/** Connected Google calendars (ticket 20). Provider tokens stay on the server. */
export interface CalendarTransport {
  events(): Promise<CalendarEventDto[]>;
  accounts(): Promise<CalendarAccountDto[]>;
  showEvents(accountId: string, showEvents: boolean): Promise<void>;
  setVisible(accountId: string, calendar: CalendarVisibilityInput): Promise<void>;
  resync(accountId: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
}

const statusCodes: Record<number, AccountErrorCode> = { 400: "INVALID_INPUT", 401: "UNAUTHENTICATED", 403: "SAVE_FAILED", 404: "CALENDAR_NOT_FOUND" };

export function browserCalendarTransport(fetcher: typeof fetch = fetch): CalendarTransport {
  async function request(method: string, path: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetcher(`/api/v1/calendar${path}`, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (!response.ok) throw new AccountTransportError(statusCodes[response.status] ?? (method === "GET" ? "CALENDAR_UNAVAILABLE" : "SAVE_FAILED"));
    return response.json().catch(() => null);
  }
  const account = (id: string) => `/accounts/${encodeURIComponent(id)}`;
  return {
    events: async () => parseEvents(await request("GET", "/events")),
    accounts: async () => parseAccounts(await request("GET", "/accounts")),
    showEvents: async (id, showEvents) => { await request("PATCH", account(id), { showEvents }); },
    setVisible: async (id, calendar) => { await request("PATCH", `${account(id)}/calendars`, calendar); },
    resync: async (id) => { await request("POST", `${account(id)}/resync`); },
    disconnect: async (id) => { await request("DELETE", account(id)); },
  };
}

export function calendarTransport(): CalendarTransport {
  if (!isTauri()) return browserCalendarTransport();
  const command = async (name: string, args?: Record<string, unknown>) => {
    try { return await invoke(name, args); }
    catch (error) { throw error instanceof AccountTransportError ? error : nativeAccountError(error); }
  };
  // Fixed native commands; Rust validates the account ID and attaches the Keychain bearer.
  return {
    events: async () => parseEvents(await command("calendar_events")),
    accounts: async () => parseAccounts(await command("calendar_accounts")),
    showEvents: async (accountId, showEvents) => { await command("show_calendar_account_events", { accountId, showEvents }); },
    setVisible: async (accountId, calendar) => { await command("set_calendar_visibility", { accountId, calendar }); },
    resync: async (accountId) => { await command("resync_calendar_account", { accountId }); },
    disconnect: async (accountId) => { await command("disconnect_calendar_account", { accountId }); },
  };
}

// Only allow-listed fields reach the cache. Colours become inline styles and
// links become hrefs, so both are checked here rather than trusted.
const hex = (value: unknown) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#4285f4";
const httpsLink = (value: unknown) => { try { return typeof value === "string" && new URL(value).protocol === "https:" ? value : null; } catch { return null; } };
const text = (value: unknown) => { if (typeof value !== "string") throw new AccountTransportError("INVALID_RESPONSE"); return value; };
const instant = (value: unknown) => { const iso = text(value); if (Number.isNaN(Date.parse(iso))) throw new AccountTransportError("INVALID_RESPONSE"); return iso; };
const list = (body: unknown, key: string) => {
  const items = (body as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(items)) throw new AccountTransportError("INVALID_RESPONSE");
  return items as Record<string, unknown>[];
};

export const parseEvents = (body: unknown): CalendarEventDto[] => list(body, "events").map(event => ({
  id: text(event.id), title: text(event.title), start: instant(event.start), end: instant(event.end),
  allDay: event.allDay === true, htmlLink: httpsLink(event.htmlLink), color: hex(event.color),
}));

export const parseAccounts = (body: unknown): CalendarAccountDto[] => list(body, "accounts").map(account => ({
  id: text(account.id), email: text(account.email), needsConsent: account.needsConsent === true,
  hasSyncError: account.hasSyncError === true, showEvents: account.showEvents !== false,
  calendars: list(account, "calendars").map(cal => ({ id: text(cal.id), summary: text(cal.summary), color: hex(cal.color), enabled: cal.enabled === true })),
}));

/**
 * The local day an event belongs to. Timed events: the viewer's local day of the
 * start instant. All-day events: the calendar date Google gave (stored as UTC
 * midnight), so they never slide to the previous day west of UTC.
 */
export const eventDayKey = (event: CalendarEventDto) => event.allDay ? event.start.slice(0, 10) : dayKey(new Date(event.start));

/** Events by day key, in start order (the server sorts by start). */
export function eventsByDay(events: CalendarEventDto[]) {
  const days = new Map<string, CalendarEventDto[]>();
  for (const event of events) days.set(eventDayKey(event), [...(days.get(eventDayKey(event)) ?? []), event]);
  return days;
}

export const calendarKeys = {
  all: (userId: string) => ["user", userId, "calendar"] as const,
  events: (userId: string) => ["user", userId, "calendar", "events"] as const,
  accounts: (userId: string) => ["user", userId, "calendar", "accounts"] as const,
};

export const calendarQueries = (transport: CalendarTransport) => ({
  events: (userId: string) => queryOptions({ queryKey: calendarKeys.events(userId), queryFn: () => transport.events() }),
  accounts: (userId: string) => queryOptions({ queryKey: calendarKeys.accounts(userId), queryFn: () => transport.accounts() }),
});

type Accounts = CalendarAccountDto[];
/**
 * Toggles flip at once and roll back on failure (legacy waited on a transition).
 * Every write refetches accounts and events; the live stream also tells the
 * user's other devices.
 */
export function calendarMutations(transport: CalendarTransport, cache: QueryClient, userId: string) {
  const key = calendarKeys.accounts(userId);
  const optimistic = <T,>(change: (accounts: Accounts, input: T) => Accounts) => ({
    onMutate: async (input: T) => {
      await cache.cancelQueries({ queryKey: key });
      const previous = cache.getQueryData<Accounts>(key);
      if (previous) cache.setQueryData(key, change(previous, input));
      return { previous };
    },
    onError: (_error: Error, _input: T, snapshot?: { previous?: Accounts }) => { if (snapshot?.previous) cache.setQueryData(key, snapshot.previous); },
  });
  const onSettled = () => cache.invalidateQueries({ queryKey: calendarKeys.all(userId) });
  return {
    showEvents: {
      mutationFn: ({ accountId, showEvents }: { accountId: string; showEvents: boolean }) => transport.showEvents(accountId, showEvents),
      ...optimistic<{ accountId: string; showEvents: boolean }>((accounts, input) => accounts.map(account => account.id === input.accountId ? { ...account, showEvents: input.showEvents } : account)),
      onSettled,
    },
    setVisible: {
      mutationFn: ({ accountId, calendar }: { accountId: string; calendar: CalendarVisibilityInput }) => transport.setVisible(accountId, calendar),
      ...optimistic<{ accountId: string; calendar: CalendarVisibilityInput }>((accounts, { accountId, calendar }) => accounts.map(account => account.id !== accountId ? account
        : { ...account, calendars: account.calendars.map(cal => cal.id === calendar.googleCalendarId ? { ...cal, enabled: calendar.visible } : cal) })),
      onSettled,
    },
    resync: { mutationFn: (accountId: string) => transport.resync(accountId), onSettled },
    disconnect: { mutationFn: (accountId: string) => transport.disconnect(accountId), onSettled },
  };
}

/**
 * Event links open Google Calendar. The browser follows the link (new tab); a
 * native WebView would navigate itself away, so Rust opens the system browser.
 */
export function openEvent(event: CalendarEventDto, click: { preventDefault(): void; stopPropagation(): void }) {
  click.stopPropagation();
  if (!isTauri() || !event.htmlLink) return;
  click.preventDefault();
  void invoke("open_calendar_event", { url: event.htmlLink }).catch(() => {});
}

/* Live updates: client side of GET /api/v1/stream (contract in packages/server/src/calendar-input.ts). */

export interface LiveListener { ready(): void; change(topic: string): void; closed(error?: AccountTransportError): void }
/** Opens one stream; the returned function closes it. `closed` fires when it ends by itself. */
export interface LiveTransport { open(listener: LiveListener): () => void }

/** Browser: same-origin EventSource with the cookie session. It reconnects by itself while it can. */
export function browserLiveTransport(create = (url: string) => new EventSource(url, { withCredentials: true })): LiveTransport {
  return {
    open(listener) {
      const source = create("/api/v1/stream");
      source.addEventListener("ready", () => listener.ready());
      source.addEventListener("change", (event) => {
        try { listener.change(String(JSON.parse((event as MessageEvent).data).topic)); } catch { /* malformed frames are ignored */ }
      });
      source.onerror = () => { if (source.readyState === EventSource.CLOSED) listener.closed(); };
      return () => source.close();
    },
  };
}

type NativeLiveMessage = { type: "ready" } | { type: "change"; topic: string } | { type: "closed"; error: string | null };
/** Native: Rust holds the bearer and forwards parsed frames over a channel. */
export function nativeLiveTransport(): LiveTransport {
  let current = 0;
  return {
    open(listener) {
      // Rust keeps one stream: opening replaces it, so only the newest may stop it.
      const id = ++current;
      let open = true;
      const channel = new Channel<NativeLiveMessage>();
      channel.onmessage = (message) => {
        if (!open) return;
        if (message.type === "ready") listener.ready();
        else if (message.type === "change") listener.change(message.topic);
        else { open = false; listener.closed(message.error ? nativeAccountError(message.error) : undefined); }
      };
      invoke("live_stream", { onEvent: channel }).catch((error) => { if (open) { open = false; listener.closed(nativeAccountError(error)); } });
      return () => { open = false; if (id === current) void invoke("stop_live_stream").catch(() => {}); };
    },
  };
}

export const liveTransport = (): LiveTransport => isTauri() ? nativeLiveTransport() : browserLiveTransport();

/**
 * Query keys each live topic invalidates. Task changes from other devices arrive
 * by polling and foreground refetch (ticket 22, connection.ts) instead; a
 * topic this table does not know is ignored, so the server may add topics first.
 */
export const liveTopicKeys: Record<string, (userId: string) => QueryKey[]> = {
  calendar: (userId) => [calendarKeys.all(userId)],
};

/**
 * Keeps one live stream open for the signed-in user: refetches every live topic
 * when a connection opens (it may have missed changes) and when the app returns
 * to the foreground (iOS suspends streams), and the changed topic's queries on
 * each change. Reconnects with backoff; an expired session asks the account.
 */
export function startLiveUpdates({ transport, cache, userId, onUnauthenticated, delays = [1_000, 2_000, 5_000, 15_000, 30_000], page = document }: {
  transport: LiveTransport; cache: QueryClient; userId: string; onUnauthenticated(): void;
  delays?: number[]; page?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}) {
  let close: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let stopped = false;
  const refresh = (topics: string[]) => {
    for (const topic of topics) for (const queryKey of liveTopicKeys[topic]?.(userId) ?? []) void cache.invalidateQueries({ queryKey });
  };
  function connect() {
    clearTimeout(timer);
    close = transport.open({
      ready() { failures = 0; refresh(Object.keys(liveTopicKeys)); },
      change(topic) { refresh([topic]); },
      closed(error) {
        close = null;
        if (stopped) return;
        if (error?.code === "UNAUTHENTICATED") { onUnauthenticated(); return; }
        timer = setTimeout(connect, delays[Math.min(failures++, delays.length - 1)]);
      },
    });
  }
  // A suspended app's stream may be silently dead, so resuming always reconnects
  // (its ready frame refetches); the direct refresh covers a failed reconnect.
  const resume = () => {
    if (page.visibilityState !== "visible" || stopped) return;
    refresh(Object.keys(liveTopicKeys));
    close?.();
    failures = 0;
    connect();
  };
  page.addEventListener("visibilitychange", resume);
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    page.removeEventListener("visibilitychange", resume);
    close?.();
  };
}
