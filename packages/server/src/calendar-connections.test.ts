import { beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectAccount, getCalendarAccounts, resyncAccount, setAccountShowEvents, setCalendarVisible } from "./calendar-connections";
import { ensureTaskCalendar, handleCalendarWebhook, logSafe } from "./calendar-sync";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});
// Stub provider: no Google credentials or network. Tokens never leave getAccessToken.
const google = vi.hoisted(() => ({
  list: vi.fn(), stop: vi.fn(), watch: vi.fn(), calendars: vi.fn(),
  tokenRequests: [] as unknown[],
}));
vi.mock("@todalo/auth", () => ({ auth: { api: { getAccessToken: async (request: unknown) => { google.tokenRequests.push(request); return { accessToken: "stub-access-token" }; } } } }));
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    calendar: () => ({ events: { list: google.list, watch: google.watch }, channels: { stop: google.stop }, calendarList: { list: google.calendars } }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  google.tokenRequests = [];
  google.list.mockResolvedValue({ data: { items: [], nextSyncToken: "sync-2" } });
  google.calendars.mockResolvedValue({ data: { items: [{ id: "alice@work", summary: "Work", backgroundColor: "#ff0000" }, { id: "alice@home", summaryOverride: "Home!", summary: "Home", backgroundColor: "#00ff00" }] } });
  boundary.rows = {
    account: [
      { id: "acct-alice", userId: "alice", providerId: "google", accountId: "google-alice" },
      { id: "acct-alice-password", userId: "alice", providerId: "credential", accountId: "alice" },
      { id: "acct-bob", userId: "bob", providerId: "google", accountId: "google-bob" },
    ],
    synced_calendars: [
      { id: "cal-work", userId: "alice", accountId: "acct-alice", googleCalendarId: "alice@work", summary: "Work", color: "#ff0000", enabled: true, syncToken: "sync-1", syncedAt: new Date(), channelId: "channel-work", resourceId: "resource-work", channelExpiresAt: null },
      { id: "cal-bob", userId: "bob", accountId: "acct-bob", googleCalendarId: "bob@cal", summary: "Bob", color: "#123456", enabled: true, syncToken: "sync-b", syncedAt: new Date(), channelId: "channel-bob", resourceId: "resource-bob", channelExpiresAt: null },
    ],
    calendar_events: [
      { id: "event-standup", calendarId: "cal-work", userId: "alice", googleEventId: "standup" },
      { id: "event-bob", calendarId: "cal-bob", userId: "bob", googleEventId: "secret" },
    ],
    calendar_account_settings: [],
  };
});

describe("calendar connections", () => {
  it("never touches another user's account", async () => {
    const before = JSON.stringify(boundary.rows);
    expect(await setAccountShowEvents("alice", "acct-bob", false)).toBe(false);
    expect(await setCalendarVisible("alice", "acct-bob", { googleCalendarId: "bob@cal", summary: "Bob", color: "#123456", visible: false })).toBe(false);
    expect(await resyncAccount("alice", "acct-bob")).toBe(false);
    const unlink = vi.fn();
    expect(await disconnectAccount("alice", "acct-bob", unlink)).toBe(false);
    expect(unlink).not.toHaveBeenCalled();
    expect(JSON.stringify(boundary.rows)).toBe(before);
    expect(google.list).not.toHaveBeenCalled();
  });

  it("lists only the user's Google accounts, merging stored visibility, and flags a missing grant", async () => {
    expect(await getCalendarAccounts("alice")).toEqual([{
      id: "acct-alice", email: "google-alice", needsConsent: false, hasSyncError: false, showEvents: true,
      calendars: [{ id: "alice@work", summary: "Work", color: "#ff0000", enabled: true }, { id: "alice@home", summary: "Home!", color: "#00ff00", enabled: false }],
    }]);
    google.calendars.mockRejectedValue(new Error("insufficient scopes"));
    expect((await getCalendarAccounts("alice"))[0]).toMatchObject({ needsConsent: true, calendars: [] });
    // The provider is asked for the provider's own account id, per linked account.
    expect(google.tokenRequests.at(-1)).toEqual({ body: { providerId: "google", userId: "alice", accountId: "google-alice" } });
  });

  it("stores the account-level switch once per account", async () => {
    await setAccountShowEvents("alice", "acct-alice", false);
    await setAccountShowEvents("alice", "acct-alice", true);
    await setAccountShowEvents("alice", "acct-alice", false);
    expect(boundary.rows.calendar_account_settings).toMatchObject([{ accountId: "acct-alice", userId: "alice", showEvents: false }]);
  });

  it("hiding a calendar stops its channel and clears its cache; showing one syncs it", async () => {
    await setCalendarVisible("alice", "acct-alice", { googleCalendarId: "alice@work", summary: "Work", color: "#ff0000", visible: false });
    expect(google.stop).toHaveBeenCalledWith({ requestBody: { id: "channel-work", resourceId: "resource-work" } });
    expect(boundary.rows.calendar_events.map(event => event.id)).toEqual(["event-bob"]);
    expect(boundary.rows.synced_calendars[0]).toMatchObject({ enabled: false, channelId: null, resourceId: null });

    await setCalendarVisible("alice", "acct-alice", { googleCalendarId: "alice@home", summary: "Home!", color: "#00ff00", visible: true });
    const home = boundary.rows.synced_calendars.find(row => row.googleCalendarId === "alice@home");
    expect(home).toMatchObject({ userId: "alice", accountId: "acct-alice", enabled: true, syncToken: "sync-2" });
    // A first sync is a full sync over the rolling window, not an incremental one.
    expect(google.list.mock.calls[0][0]).toMatchObject({ calendarId: "alice@home", singleEvents: true });
    expect(google.list.mock.calls[0][0].syncToken).toBeUndefined();
  });

  it("resync drops the sync token so the next sync is full", async () => {
    await resyncAccount("alice", "acct-alice");
    expect(google.list).toHaveBeenCalledTimes(1);
    expect(google.list.mock.calls[0][0].syncToken).toBeUndefined();
    expect(google.list.mock.calls[0][0].timeMin).toBeDefined();
  });

  it("disconnect stops channels, removes calendars and settings, then unlinks the provider account", async () => {
    await setAccountShowEvents("alice", "acct-alice", false);
    const unlink = vi.fn();
    expect(await disconnectAccount("alice", "acct-alice", unlink)).toBe(true);
    expect(google.stop).toHaveBeenCalledTimes(1);
    expect(boundary.rows.synced_calendars.map(row => row.id)).toEqual(["cal-bob"]);
    expect(boundary.rows.calendar_account_settings).toEqual([]);
    expect(unlink).toHaveBeenCalledWith({ providerId: "google", accountId: "google-alice" });
  });
});

describe("Google webhook", () => {
  const headers = (change: Record<string, string> = {}) => new Headers({ "x-goog-channel-id": "channel-work", "x-goog-resource-id": "resource-work", "x-goog-channel-token": "cal-work", "x-goog-resource-state": "exists", ...change });

  it("rejects unknown or mismatched channels without syncing", async () => {
    for (const change of [{ "x-goog-channel-id": "guess" }, { "x-goog-resource-id": "guess" }, { "x-goog-channel-token": "cal-bob" }, { "x-goog-channel-token": "missing" }] as Record<string, string>[]) {
      expect(await handleCalendarWebhook(headers(change))).toEqual({ status: 404 });
    }
    expect(await handleCalendarWebhook(new Headers())).toEqual({ status: 404 });
    expect(await handleCalendarWebhook(headers({ "x-goog-resource-state": "sync" }))).toEqual({ status: 200 });
    expect(google.list).not.toHaveBeenCalled();
  });

  it("runs an incremental sync for a verified change and names the owner to notify", async () => {
    google.list.mockResolvedValue({ data: { items: [{ id: "standup", status: "cancelled" }, { id: "wfh", eventType: "workingLocation" }], nextSyncToken: "sync-3" } });
    expect(await handleCalendarWebhook(headers())).toEqual({ status: 200, userId: "alice" });
    expect(google.list.mock.calls[0][0]).toMatchObject({ calendarId: "alice@work", syncToken: "sync-1" });
    expect(boundary.rows.calendar_events.map(event => event.id)).toEqual(["event-bob"]);
    expect(boundary.rows.synced_calendars[0].syncToken).toBe("sync-3");
  });

  it("an expired sync token clears the cache and resyncs in full at once; failures still answer 200", async () => {
    google.list.mockRejectedValueOnce(Object.assign(new Error("Gone"), { code: 410 }));
    expect(await handleCalendarWebhook(headers())).toEqual({ status: 200, userId: "alice" });
    expect(boundary.rows.calendar_events.map(event => event.id)).toEqual(["event-bob"]);
    expect(google.list.mock.calls[1][0].syncToken).toBeUndefined();
    expect(boundary.rows.synced_calendars[0].syncToken).toBe("sync-2");

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    google.list.mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { code: 500, config: { headers: { Authorization: "Bearer stub-access-token" } } }));
    expect(await handleCalendarWebhook(headers())).toEqual({ status: 200 });
    expect(JSON.stringify(error.mock.calls)).not.toContain("stub-access-token");
    error.mockRestore();
  });

  it("logs provider errors without their request config", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logSafe("failed", "cal-work", { code: 401, message: "Invalid Credentials", config: { headers: { Authorization: "Bearer secret" } } });
    expect(error).toHaveBeenCalledWith("failed", "cal-work", { code: 401, message: "Invalid Credentials" });
    error.mockRestore();
  });
});

describe("two-way task sync (Google → task)", () => {
  const seen = new Date("2026-11-07T11:00:00.000Z");
  const edited = "2026-11-07T12:00:00.000Z";
  const headers = new Headers({ "x-goog-channel-id": "channel-tasks", "x-goog-resource-id": "resource-tasks", "x-goog-channel-token": "cal-tasks", "x-goog-resource-state": "exists" });
  beforeEach(() => {
    boundary.rows.synced_calendars.push({ id: "cal-tasks", userId: "alice", accountId: "acct-alice", googleCalendarId: "primary", summary: "Tasks", color: "#4285f4", enabled: true, tasksOnly: true, syncToken: "t-1", syncedAt: new Date(), channelId: "channel-tasks", resourceId: "resource-tasks", channelExpiresAt: null });
    boundary.rows.tasks = [
      { id: "block", userId: "alice", title: "Write", dueDate: new Date("2026-11-09T09:00:00Z"), dueDateEnd: new Date("2026-11-09T10:00:00Z"), googleCalendarEventId: "ev-block", updatedAt: seen },
      { id: "gone", userId: "alice", title: "Call", dueDate: new Date("2026-11-09T12:00:00Z"), dueDateEnd: new Date("2026-11-09T12:30:00Z"), googleCalendarEventId: "ev-gone", updatedAt: seen },
      { id: "echo", userId: "alice", title: "Read", dueDate: new Date("2026-11-10T09:00:00Z"), dueDateEnd: new Date("2026-11-10T10:00:00Z"), googleCalendarEventId: "ev-echo", updatedAt: seen },
      { id: "bobs", userId: "bob", title: "Bob's", dueDate: new Date("2026-11-09T09:00:00Z"), dueDateEnd: null, googleCalendarEventId: "ev-bob", updatedAt: seen },
    ];
  });
  const task = (id: string) => boundary.rows.tasks.find(row => row.id === id)!;

  it("applies moved, resized, renamed and deleted events to the owner's tasks, ignores echoes and caches no events", async () => {
    google.list.mockResolvedValue({ data: { nextSyncToken: "t-2", items: [
      { id: "ev-block", summary: "Write chapter 2", start: { dateTime: "2026-11-09T13:00:00Z" }, end: { dateTime: "2026-11-09T15:00:00Z" }, updated: edited },
      { id: "ev-gone", status: "cancelled", updated: edited },
      { id: "ev-echo", summary: "Read", start: { dateTime: "2026-11-10T09:00:00.000Z" }, end: { dateTime: "2026-11-10T10:00:00.000Z" }, updated: edited },
      // Another user's event ID in this calendar never reaches their task.
      { id: "ev-bob", summary: "Hijacked", start: { date: "2026-11-12" }, end: { date: "2026-11-13" }, updated: edited },
    ] } });
    expect(await handleCalendarWebhook(headers)).toEqual({ status: 200, userId: "alice" });
    expect(google.list.mock.calls[0][0]).toMatchObject({ calendarId: "primary", syncToken: "t-1" });
    expect(task("block")).toMatchObject({ title: "Write chapter 2", dueDate: new Date("2026-11-09T13:00:00Z"), dueDateEnd: new Date("2026-11-09T15:00:00Z") });
    expect(task("gone")).toMatchObject({ title: "Call", dueDate: null, dueDateEnd: null, googleCalendarEventId: null });
    expect(task("echo").updatedAt).toBe(seen);
    expect(task("bobs")).toMatchObject({ title: "Bob's", dueDate: new Date("2026-11-09T09:00:00Z") });
    expect(boundary.rows.calendar_events.filter(event => event.calendarId === "cal-tasks")).toEqual([]);
    expect(boundary.rows.synced_calendars.find(row => row.id === "cal-tasks")!.syncToken).toBe("t-2");
    // Inbound writes never push back to Google (no echo loop).
    expect(google.watch).not.toHaveBeenCalled();
  });

  it("the push calendar gets one tasks-only row once calendar access is granted", async () => {
    boundary.rows.synced_calendars = boundary.rows.synced_calendars.filter(row => row.id !== "cal-tasks");
    await ensureTaskCalendar("alice");
    expect(boundary.rows.synced_calendars.filter(row => row.tasksOnly)).toEqual([]);
    boundary.rows.account[0].scope = "openid,https://www.googleapis.com/auth/calendar.events";
    await ensureTaskCalendar("alice");
    await ensureTaskCalendar("alice");
    expect(boundary.rows.synced_calendars.filter(row => row.tasksOnly)).toMatchObject([{ userId: "alice", accountId: "acct-alice", googleCalendarId: "primary" }]);
  });

  it("an expired token resyncs the calendar in full and still applies its edits", async () => {
    google.list
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { code: 410 }))
      .mockResolvedValueOnce({ data: { nextSyncToken: "t-full", items: [{ id: "ev-block", summary: "Write", start: { dateTime: "2026-11-09T09:00:00Z" }, end: { dateTime: "2026-11-09T09:45:00Z" }, updated: edited }] } });
    expect(await handleCalendarWebhook(headers)).toEqual({ status: 200, userId: "alice" });
    expect(google.list.mock.calls[1][0].syncToken).toBeUndefined();
    expect(task("block").dueDateEnd).toEqual(new Date("2026-11-09T09:45:00Z"));
    expect(boundary.rows.synced_calendars.find(row => row.id === "cal-tasks")!.syncToken).toBe("t-full");
  });
});
