import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import {
  browserCalendarTransport, browserLiveTransport, calendarKeys, calendarMutations, eventDayKey, parseAccounts, parseEvents, startLiveUpdates,
  type CalendarAccountDto, type CalendarEventDto, type CalendarTransport, type LiveListener,
} from "./calendar";
import { CalendarSettings, type CalendarActions } from "./calendar-views";
import { CalendarView, TodaySchedule, UpcomingList, type ScheduleSlots } from "./schedule-views";
import { TodayView } from "./views";
import { AccountTransportError } from "./errors";

const originalZone = process.env.TZ;
afterEach(() => { process.env.TZ = originalZone; vi.useRealTimers(); });

const event = (title: string, start: string, end: string, extra: Partial<CalendarEventDto> = {}): CalendarEventDto => ({
  id: title, title, start, end, allDay: false, htmlLink: `https://www.google.com/calendar/event?eid=${title}`, color: "#ff0000", ...extra,
});

describe("calendar DTOs", () => {
  it("keeps only allow-listed fields and refuses unsafe colours and links", () => {
    const [parsed] = parseEvents({ events: [{ id: "e1", title: "Standup", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T09:15:00.000Z", allDay: false, htmlLink: "javascript:alert(1)", color: "red;background:url(x)", googleEventId: "secret", userId: "bob" }] });
    expect(parsed).toEqual({ id: "e1", title: "Standup", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T09:15:00.000Z", allDay: false, htmlLink: null, color: "#4285f4" });
    expect(() => parseEvents({ events: [{ id: "e1", title: "x", start: "not a date", end: "x" }] })).toThrow(AccountTransportError);
    expect(() => parseEvents({})).toThrow(AccountTransportError);
    const [account] = parseAccounts({ accounts: [{ id: "a", email: "a@example.test", needsConsent: false, hasSyncError: false, showEvents: true, accessToken: "x", calendars: [{ id: "c", summary: "Work", color: "#00ff00", enabled: true, syncToken: "t" }] }] });
    expect(account).toEqual({ id: "a", email: "a@example.test", needsConsent: false, hasSyncError: false, showEvents: true, calendars: [{ id: "c", summary: "Work", color: "#00ff00", enabled: true }] });
  });

  it("puts timed events on the viewer's local day and all-day events on their calendar date", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(eventDayKey(event("late", "2026-10-16T03:30:00.000Z", "2026-10-16T04:00:00.000Z"))).toBe("2026-10-15");
    // Google's all-day date is stored as UTC midnight; it must not slide to the 15th.
    expect(eventDayKey(event("trip", "2026-10-16T00:00:00.000Z", "2026-10-17T00:00:00.000Z", { allDay: true }))).toBe("2026-10-16");
    process.env.TZ = "Europe/Zurich";
    expect(eventDayKey(event("late", "2026-10-15T22:30:00.000Z", "2026-10-15T23:00:00.000Z"))).toBe("2026-10-16");
  });

  it("maps HTTP failures to safe client errors", async () => {
    const respond = (status: number) => browserCalendarTransport(async () => new Response("{}", { status }));
    await expect(respond(404).resync("a")).rejects.toMatchObject({ code: "CALENDAR_NOT_FOUND" });
    await expect(respond(401).events()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(respond(502).disconnect("a")).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await expect(respond(500).accounts()).rejects.toMatchObject({ code: "CALENDAR_UNAVAILABLE" });
    await expect(browserCalendarTransport(async () => { throw new TypeError("offline"); }).events()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
    const calls: [string, RequestInit][] = [];
    await browserCalendarTransport(async (url, init) => { calls.push([String(url), init!]); return Response.json({ ok: true }); })
      .setVisible("acct/1", { googleCalendarId: "a@b", summary: "Work", color: "#ff0000", visible: true });
    expect(calls[0][0]).toBe("/api/v1/calendar/accounts/acct%2F1/calendars");
    expect(calls[0][1]).toMatchObject({ method: "PATCH", credentials: "same-origin" });
  });
});

describe("calendar settings writes", () => {
  const accounts: CalendarAccountDto[] = [{ id: "a", email: "a@example.test", needsConsent: false, hasSyncError: false, showEvents: true, calendars: [{ id: "work", summary: "Work", color: "#ff0000", enabled: true }] }];
  const transport = (fail = false): CalendarTransport => ({
    events: async () => [], accounts: async () => accounts,
    showEvents: async () => { if (fail) throw new AccountTransportError("SAVE_FAILED"); },
    setVisible: async () => { if (fail) throw new AccountTransportError("SAVE_FAILED"); },
    resync: async () => {}, disconnect: async () => {},
  });

  it("flips toggles at once, rolls back a failed save and refetches events", async () => {
    const cache = new QueryClient();
    cache.setQueryData(calendarKeys.accounts("u"), accounts);
    cache.setQueryData(calendarKeys.events("u"), []);
    const writes = calendarMutations(transport(true), cache, "u");
    const run = <V,>(options: object, input: V) => cache.getMutationCache().build(cache, options as never).execute(input as never);
    const hiding = run(writes.setVisible, { accountId: "a", calendar: { googleCalendarId: "work", summary: "Work", color: "#ff0000", visible: false } });
    await expect(hiding).rejects.toThrow();
    expect(cache.getQueryData(calendarKeys.accounts("u"))).toEqual(accounts);
    const ok = calendarMutations(transport(false), cache, "u");
    await run(ok.showEvents, { accountId: "a", showEvents: false });
    expect(cache.getQueryData<CalendarAccountDto[]>(calendarKeys.accounts("u"))![0].showEvents).toBe(false);
    expect(cache.getQueryState(calendarKeys.events("u"))!.isInvalidated).toBe(true);
  });
});

/** A controllable stream: tests drive ready/change/closed by hand. */
function fakeLive() {
  const opened: { listener: LiveListener; closed: boolean }[] = [];
  return { opened, transport: { open(listener: LiveListener) { const entry = { listener, closed: false }; opened.push(entry); return () => { entry.closed = true; }; } } };
}
function fakePage() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    show() { this.visibilityState = "visible"; listeners.forEach(listener => listener()); },
    listeners,
  };
}

describe("live updates", () => {
  const setup = () => {
    vi.useFakeTimers();
    const cache = new QueryClient();
    cache.setQueryData(calendarKeys.events("u"), []);
    cache.setQueryData(["user", "u", "today"], {});
    const live = fakeLive();
    const page = fakePage();
    const onUnauthenticated = vi.fn();
    const stop = startLiveUpdates({ transport: live.transport, cache, userId: "u", onUnauthenticated, delays: [100, 1_000], page: page as never });
    const invalidated = () => cache.getQueryState(calendarKeys.events("u"))!.isInvalidated;
    const reset = () => cache.setQueryData(calendarKeys.events("u"), []);
    return { cache, live, page, onUnauthenticated, stop, invalidated, reset };
  };

  it("refetches on (re)connect and on a calendar change, ignoring unknown topics", () => {
    const { cache, live, invalidated, reset } = setup();
    expect(live.opened).toHaveLength(1);
    live.opened[0].listener.ready();
    expect(invalidated()).toBe(true);
    reset();
    live.opened[0].listener.change("tasks");
    expect(invalidated()).toBe(false);
    expect(cache.getQueryState(["user", "u", "today"])!.isInvalidated).toBe(false);
    live.opened[0].listener.change("calendar");
    expect(invalidated()).toBe(true);
  });

  it("reconnects with backoff after a drop, and resets the backoff once connected", () => {
    const { live } = setup();
    live.opened[0].listener.closed();
    vi.advanceTimersByTime(99);
    expect(live.opened).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(live.opened).toHaveLength(2);
    live.opened[1].listener.closed();
    vi.advanceTimersByTime(999);
    expect(live.opened).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(live.opened).toHaveLength(3);
    live.opened[2].listener.ready();
    live.opened[2].listener.closed();
    vi.advanceTimersByTime(100);
    expect(live.opened).toHaveLength(4);
  });

  it("asks the account instead of retrying when the session expired", () => {
    const { live, onUnauthenticated } = setup();
    live.opened[0].listener.closed(new AccountTransportError("UNAUTHENTICATED"));
    vi.advanceTimersByTime(60_000);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(live.opened).toHaveLength(1);
  });

  it("refetches and reconnects when the app returns to the foreground; stop closes everything", () => {
    const { live, page, invalidated, stop } = setup();
    page.show();
    expect(invalidated()).toBe(true);
    expect(live.opened.map(entry => entry.closed)).toEqual([true, false]);
    stop();
    expect(live.opened[1].closed).toBe(true);
    expect(page.listeners.size).toBe(0);
    live.opened[1].listener.closed();
    vi.advanceTimersByTime(60_000);
    expect(live.opened).toHaveLength(2);
  });

  it("reads ready and change frames from a browser EventSource and reports a closed stream", () => {
    const handlers: Record<string, (event: { data?: string }) => void> = {};
    const source = { readyState: 1, onerror: null as null | (() => void), addEventListener: (name: string, handler: (event: { data?: string }) => void) => { handlers[name] = handler; }, close: vi.fn() };
    vi.stubGlobal("EventSource", { CLOSED: 2 });
    const urls: string[] = [];
    const listener = { ready: vi.fn(), change: vi.fn(), closed: vi.fn() };
    const close = browserLiveTransport((url) => { urls.push(url); return source as never; }).open(listener);
    expect(urls).toEqual(["/api/v1/stream"]);
    handlers.ready({ data: "{}" });
    handlers.change({ data: '{"topic":"calendar"}' });
    handlers.change({ data: "not json" });
    expect(listener.ready).toHaveBeenCalledTimes(1);
    expect(listener.change.mock.calls).toEqual([["calendar"]]);
    source.readyState = 0; source.onerror!();
    expect(listener.closed).not.toHaveBeenCalled();
    source.readyState = 2; source.onerror!();
    expect(listener.closed).toHaveBeenCalledTimes(1);
    close();
    expect(source.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("events in Today and Upcoming", () => {
  const slots: ScheduleSlots = { row: item => createElement("p", { key: item.id, className: "row" }, item.title), open() {}, complete() {}, remove() {}, slot() {} };
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
  const at = (day: number, hours = 0, minutes = 0) => new Date(2026, 9, day, hours, minutes).toISOString();
  const now = new Date(2026, 9, 7, 8);
  const tasks = [{ id: "t", title: "Task today", description: null, status: "todo" as const, priority: 4, projectId: null, parentId: null, sectionId: null, dueDate: at(7, 12), dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: at(1) }];
  const events = [
    event("Standup", at(7, 9), at(7, 9, 30)),
    event("Holiday", "2026-10-07T00:00:00.000Z", "2026-10-08T00:00:00.000Z", { allDay: true, color: "#00ff00" }),
    event("Tomorrow call", at(8, 15), at(8, 16)),
  ];

  it("lists today's events before tasks as read-only links", () => {
    process.env.TZ = "Europe/Zurich";
    const html = render(createElement(TodayView, { state: { status: "success", data: { tasks, openCount: 1 } as never, error: null }, onRetry() {}, now, events }));
    expect(html.indexOf("Standup")).toBeLessThan(html.indexOf("Task today"));
    expect(html).toContain("Holiday");
    expect(html).not.toContain("Tomorrow call");
    expect(html).toContain('href="https://www.google.com/calendar/event?eid=Standup" target="_blank" rel="noreferrer"');
    expect(html).toContain("09:00");
  });

  it("places events first in each Upcoming day, as chips in the month and blocks in the schedule", () => {
    process.env.TZ = "Europe/Zurich";
    const upcoming = render(createElement(UpcomingList, { tasks, events, slots, composer: () => null, now }));
    const day = upcoming.slice(upcoming.indexOf('id="2026-10-07"'), upcoming.indexOf('id="2026-10-08"'));
    expect(day.indexOf("Standup")).toBeLessThan(day.indexOf("Task today"));
    expect(upcoming.slice(upcoming.indexOf('id="2026-10-08"'))).toContain("Tomorrow call");
    const month = render(createElement(CalendarView, { tasks, events, slots, now }));
    expect(month).toContain('class="event-chip"');
    const schedule = render(createElement(TodaySchedule, { tasks, events, slots, now }));
    // 09:00 local = 9 × 48px; the all-day event sits in the all-day row, not the hours.
    expect(schedule).toMatch(/class="event-block" style="top:432px;height:24px/);
    expect(schedule.indexOf("Holiday")).toBeLessThan(schedule.indexOf("schedule-body"));
  });
});

describe("Calendars settings", () => {
  const actions: CalendarActions = { showEvents: vi.fn(), setVisible: vi.fn(), resync: vi.fn(), disconnect: vi.fn() };
  const render = (accounts: CalendarAccountDto[], pending = new Set<string>()) => renderToStaticMarkup(createElement(CalendarSettings, { state: { status: "success", data: accounts, error: null }, onRetry() {}, actions, pending, error: null, link: createElement("button", null, "Link Google account") }));

  it("matches the legacy card: status, resync/disconnect, show switch and eye toggles", () => {
    const html = render([{ id: "a", email: "a@example.test", needsConsent: false, hasSyncError: true, showEvents: false, calendars: [{ id: "work", summary: "Work", color: "#ff0000", enabled: true }, { id: "home", summary: "Home", color: "#00ff00", enabled: false }] }]);
    expect(html).toContain("Error");
    expect(html).toContain(">Resync<");
    expect(html).toContain(">Disconnect<");
    expect(html).toContain("Show events in Today/Upcoming");
    expect(html).toContain('aria-label="Hide Work"');
    expect(html).toContain('aria-label="Show Home"');
    expect(html).not.toMatch(/role="switch" checked/);
  });

  it("offers relinking for an account without calendar access, and an empty state", () => {
    expect(render([{ id: "a", email: "old@example.test", needsConsent: true, hasSyncError: false, showEvents: true, calendars: [] }])).toContain("Grant calendar access to show this account&#x27;s events.");
    expect(render([])).toContain("No Google accounts connected yet.");
    expect(render([{ id: "a", email: "a@example.test", needsConsent: false, hasSyncError: false, showEvents: true, calendars: [] }], new Set(["a"]))).toMatch(/disabled="">Resync/);
  });
});
