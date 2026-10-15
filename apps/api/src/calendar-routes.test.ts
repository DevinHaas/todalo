import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCalendarRoutes } from "./calendar-routes";
import { memoryCalendarStore, type StubGoogleEvent } from "../test-fixtures/calendar-store";
import { publish, subscribe } from "../../../packages/server/src/live";

const origin = "http://localhost:5173";
const at = (iso: string) => new Date(iso);
let google: Map<string, StubGoogleEvent[]>;
let fixture: ReturnType<typeof memoryCalendarStore>;
let app: ReturnType<typeof createCalendarRoutes>;
let unlinked: Headers[];

beforeEach(() => {
  google = new Map([
    ["alice@work", [{ id: "standup", title: "Standup", start: at("2026-10-15T09:00:00Z"), end: at("2026-10-15T09:15:00Z"), htmlLink: "https://calendar.google.com/e/standup" }]],
    ["alice@home", [{ id: "trip", title: "Trip", start: at("2026-10-16T00:00:00Z"), end: at("2026-10-17T00:00:00Z"), allDay: true }, { id: "pushed", title: "Pushed task", start: at("2026-10-16T00:00:00Z"), end: at("2026-10-17T00:00:00Z"), allDay: true }]],
    ["bob@cal", [{ id: "secret", title: "Bob's secret", start: at("2026-10-15T10:00:00Z"), end: at("2026-10-15T11:00:00Z") }]],
  ]);
  fixture = memoryCalendarStore({
    accounts: [
      { id: "acct-alice", userId: "alice", email: "alice@example.test", calendars: [{ id: "alice@work", summary: "Work", color: "#ff0000" }, { id: "alice@home", summary: "Home", color: "#00ff00" }, { id: "alice@hidden", summary: "Hidden", color: "#0000ff" }] },
      { id: "acct-alice-revoked", userId: "alice", email: "old@example.test", calendars: null },
      { id: "acct-bob", userId: "bob", email: "bob@example.test", calendars: [{ id: "bob@cal", summary: "Bob", color: "#123456" }] },
    ],
    google,
    synced: [
      { id: "cal-work", userId: "alice", accountId: "acct-alice", googleCalendarId: "alice@work", summary: "Work", color: "#ff0000", enabled: true },
      { id: "cal-home", userId: "alice", accountId: "acct-alice", googleCalendarId: "alice@home", summary: "Home", color: "#00ff00", enabled: true },
      { id: "cal-bob", userId: "bob", accountId: "acct-bob", googleCalendarId: "bob@cal", summary: "Bob", color: "#123456", enabled: true },
    ],
    ownEventIds: new Set(["pushed"]),
    subscribe, publish,
  });
  unlinked = [];
  const disconnect = fixture.store.disconnect;
  app = createCalendarRoutes({
    ...fixture.store,
    verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
    allowedOrigins: new Set([origin]),
    disconnect: async (userId, accountId, session) => { unlinked.push(session); return disconnect(userId, accountId, session); },
    heartbeatMs: 20,
  });
});

// Every request gets a signal; aborting it is how a client disconnect reaches the server.
let connections: AbortController[] = [];
afterEach(() => { connections.forEach(connection => connection.abort()); connections = []; });
const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown; headers?: Headers } = {}) => {
  const connection = new AbortController();
  connections.push(connection);
  const headers = init.headers ?? new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost${path}`, { method, headers, signal: connection.signal, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const titles = async (user: string) => ((await (await call("GET", "/api/v1/calendar/events", { user })).json()) as { events: { title: string }[] }).events.map(event => event.title);

describe("calendar events API", () => {
  it("returns only the session user's visible events as DTOs, without echoes of pushed tasks", async () => {
    const response = await call("GET", "/api/v1/calendar/events", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ events: [
      { id: "cal-work:standup", title: "Standup", start: "2026-10-15T09:00:00.000Z", end: "2026-10-15T09:15:00.000Z", allDay: false, htmlLink: "https://calendar.google.com/e/standup", color: "#ff0000" },
      { id: "cal-home:trip", title: "Trip", start: "2026-10-16T00:00:00.000Z", end: "2026-10-17T00:00:00.000Z", allDay: true, htmlLink: null, color: "#00ff00" },
    ] });
    expect(await titles("bob")).toEqual(["Bob's secret"]);
    expect((await call("GET", "/api/v1/calendar/events")).status).toBe(401);
  });

  it("lists linked accounts with their calendars and flags a missing calendar grant", async () => {
    const { accounts } = await (await call("GET", "/api/v1/calendar/accounts", { user: "alice" })).json() as { accounts: { id: string; needsConsent: boolean; calendars: { id: string; enabled: boolean }[] }[] };
    expect(accounts.map(account => [account.id, account.needsConsent])).toEqual([["acct-alice", false], ["acct-alice-revoked", true]]);
    expect(accounts[0].calendars.map(cal => [cal.id, cal.enabled])).toEqual([["alice@work", true], ["alice@home", true], ["alice@hidden", false]]);
    expect(JSON.stringify(accounts)).not.toMatch(/token|bob/i);
  });
});

describe("calendar settings writes", () => {
  it("hides an account's events and a single calendar, and shows a calendar again", async () => {
    expect(await (await call("PATCH", "/api/v1/calendar/accounts/acct-alice", { user: "alice", body: { showEvents: false } })).json()).toEqual({ ok: true });
    expect(await titles("alice")).toEqual([]);
    await call("PATCH", "/api/v1/calendar/accounts/acct-alice", { user: "alice", body: { showEvents: true } });
    const hide = { googleCalendarId: "alice@work", summary: "Work", color: "#ff0000", visible: false };
    expect((await call("PATCH", "/api/v1/calendar/accounts/acct-alice/calendars", { user: "alice", body: hide })).status).toBe(200);
    expect(await titles("alice")).toEqual(["Trip"]);
    await call("PATCH", "/api/v1/calendar/accounts/acct-alice/calendars", { user: "alice", body: { ...hide, visible: true } });
    expect(await titles("alice")).toEqual(["Standup", "Trip"]);
  });

  it("resyncs from the provider and disconnects with only the caller's own auth header", async () => {
    google.get("alice@work")!.push({ id: "review", title: "Review", start: at("2026-10-15T15:00:00Z"), end: at("2026-10-15T16:00:00Z") });
    expect((await call("POST", "/api/v1/calendar/accounts/acct-alice/resync", { user: "alice" })).status).toBe(200);
    expect(await titles("alice")).toEqual(["Standup", "Review", "Trip"]);
    const response = await call("DELETE", "/api/v1/calendar/accounts/acct-alice", { cookie: "alice", origin });
    expect(response.status).toBe(200);
    expect([...unlinked[0].keys()]).toEqual(["cookie"]);
    expect(await titles("alice")).toEqual([]);
    const { accounts } = await (await call("GET", "/api/v1/calendar/accounts", { user: "alice" })).json() as { accounts: { id: string }[] };
    expect(accounts.map(account => account.id)).toEqual(["acct-alice-revoked"]);
    // A bearer disconnect never forwards a cookie that happens to be present.
    await call("DELETE", "/api/v1/calendar/accounts/acct-alice-revoked", { user: "alice", cookie: "bob" });
    expect([...unlinked[1].keys()]).toEqual(["authorization"]);
  });

  it("answers 404 for missing and other users' accounts without changing them", async () => {
    for (const id of ["acct-bob", "missing"]) {
      for (const [method, path, body] of [["PATCH", `/api/v1/calendar/accounts/${id}`, { showEvents: false }], ["PATCH", `/api/v1/calendar/accounts/${id}/calendars`, { googleCalendarId: "bob@cal", summary: "x", color: "#000000", visible: false }], ["POST", `/api/v1/calendar/accounts/${id}/resync`, undefined], ["DELETE", `/api/v1/calendar/accounts/${id}`, undefined]] as const) {
        const response = await call(method, path, { user: "alice", body });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ code: "NOT_FOUND", message: "This calendar account does not exist or you do not have access to it." });
      }
    }
    expect(await titles("bob")).toEqual(["Bob's secret"]);
  });

  it("validates bodies and guards cookie writes by Origin", async () => {
    for (const body of [{}, { showEvents: "no" }, { showEvents: true, userId: "bob" }]) {
      expect((await call("PATCH", "/api/v1/calendar/accounts/acct-alice", { user: "alice", body })).status).toBe(400);
    }
    for (const body of [{ googleCalendarId: "alice@work", summary: "Work", color: "red;background:url(x)", visible: true }, { googleCalendarId: "", summary: "", color: "#ffffff", visible: true }]) {
      expect((await call("PATCH", "/api/v1/calendar/accounts/acct-alice/calendars", { user: "alice", body })).status).toBe(400);
    }
    expect((await call("PATCH", "/api/v1/calendar/accounts/acct-alice", { cookie: "alice", origin: "https://evil.example", body: { showEvents: false } })).status).toBe(403);
    expect((await call("DELETE", "/api/v1/calendar/accounts/acct-alice", { cookie: "alice" })).status).toBe(403);
    expect((await call("POST", "/api/v1/calendar/accounts/acct-alice/resync", { origin })).status).toBe(401);
    expect(await titles("alice")).toEqual(["Standup", "Trip"]);
  });

  it("reports a provider failure as a failed save", async () => {
    const failing = createCalendarRoutes({ ...fixture.store, verify: async () => "alice", allowedOrigins: new Set(), resync: async () => { throw new Error("invalid_grant"); } });
    const response = await failing.handle(new Request("http://localhost/api/v1/calendar/accounts/acct-alice/resync", { method: "POST", headers: { authorization: "Bearer alice" } }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "SAVE_FAILED", message: "Your changes could not be saved. Try again." });
  });
});

/** Reads SSE frames from a stream response until `count` non-heartbeat frames arrived. */
async function frames(response: Response, count: number) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const seen = () => text.split("\n\n").filter(part => part && !part.startsWith(":"));
  while (seen().length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return { frames: seen().slice(0, count), text, reader };
}

describe("live stream and Google webhook", () => {
  it("authenticates the stream by cookie or bearer and starts with a ready frame", async () => {
    expect((await call("GET", "/api/v1/stream")).status).toBe(401);
    const response = await call("GET", "/api/v1/stream", { cookie: "alice" });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store, no-transform");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const { frames: [ready], reader } = await frames(response, 1);
    expect(ready).toBe("event: ready\ndata: {}");
    await reader.cancel();
  });

  it("delivers a provider change to every stream of the calendar's owner only", async () => {
    const [phone, laptop, bob] = await Promise.all([call("GET", "/api/v1/stream", { user: "alice" }), call("GET", "/api/v1/stream", { cookie: "alice" }), call("GET", "/api/v1/stream", { user: "bob" })]);
    google.get("alice@work")!.push({ id: "moved", title: "Moved meeting", start: at("2026-10-15T13:00:00Z"), end: at("2026-10-15T14:00:00Z") });
    const webhook = await call("POST", "/api/calendar/webhook", { headers: fixture.providerChanged("alice@work")! });
    expect(webhook.status).toBe(200);
    for (const stream of [phone, laptop]) {
      const { frames: received, reader } = await frames(stream, 2);
      expect(received).toEqual(["event: ready\ndata: {}", 'event: change\ndata: {"topic":"calendar"}']);
      await reader.cancel();
    }
    expect(await titles("alice")).toContain("Moved meeting");
    // Bob gets heartbeats but no change.
    const bobReader = bob.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes(": heartbeat")) text += decoder.decode((await bobReader.read()).value);
    expect(text).not.toContain("change");
    await bobReader.cancel();
  });

  it("rejects spoofed callbacks and acknowledges the channel handshake without syncing", async () => {
    const real = fixture.providerChanged("alice@work")!;
    for (const change of [["x-goog-channel-id", "guessed"], ["x-goog-resource-id", "guessed"], ["x-goog-channel-token", "cal-bob"]]) {
      const headers = new Headers(real);
      headers.set(change[0], change[1]);
      expect((await call("POST", "/api/calendar/webhook", { headers })).status).toBe(404);
    }
    expect((await call("POST", "/api/calendar/webhook")).status).toBe(404);
    const stream = await call("GET", "/api/v1/stream", { user: "alice" });
    const handshake = new Headers(real);
    handshake.set("x-goog-resource-state", "sync");
    expect((await call("POST", "/api/calendar/webhook", { headers: handshake })).status).toBe(200);
    // A settings write is a change too, so a later frame proves nothing arrived for the handshake.
    await call("PATCH", "/api/v1/calendar/accounts/acct-alice", { user: "alice", body: { showEvents: true } });
    const { frames: received, reader } = await frames(stream, 2);
    expect(received).toEqual(["event: ready\ndata: {}", 'event: change\ndata: {"topic":"calendar"}']);
    await reader.cancel();
  });

  it("unsubscribes when the client disconnects", async () => {
    const live = (globalThis as unknown as { todaloLiveSubscribers: Map<string, Set<unknown>> }).todaloLiveSubscribers;
    expect(live.has("alice")).toBe(false);
    const stream = await call("GET", "/api/v1/stream", { user: "alice" });
    await frames(stream, 1);
    expect(live.get("alice")?.size).toBe(1);
    connections.at(-1)!.abort();
    expect(live.has("alice")).toBe(false);
  });
});
