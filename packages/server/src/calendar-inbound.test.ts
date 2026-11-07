import { describe, expect, it, vi } from "vitest";
import { inboundPatch, listEventChanges, type InboundEvent, type InboundTask } from "./calendar-inbound";

const edited = "2026-11-07T12:00:00.000Z";
const before = new Date("2026-11-07T11:00:00.000Z");
// A timed task (a schedule block) 9:00–10:00 UTC, and an all-day task on Nov 9 (server-local midnight).
const block: InboundTask = { title: "Write", dueDate: new Date("2026-11-09T09:00:00.000Z"), dueDateEnd: new Date("2026-11-09T10:00:00.000Z"), updatedAt: before };
const allDay: InboundTask = { title: "Pay rent", dueDate: new Date(2026, 10, 9), dueDateEnd: null, updatedAt: before };
const timed = (start: string, end: string, extra: Partial<InboundEvent> = {}): InboundEvent => ({ id: "e", summary: "Write", start: { dateTime: start }, end: { dateTime: end }, updated: edited, ...extra });

describe("Google event edits flowing back into tasks", () => {
  it.each<[string, InboundTask, InboundEvent, ReturnType<typeof inboundPatch>]>([
    ["moved", block, timed("2026-11-09T13:00:00Z", "2026-11-09T14:00:00Z"), { dueDate: new Date("2026-11-09T13:00:00Z"), dueDateEnd: new Date("2026-11-09T14:00:00Z") }],
    ["resized", block, timed("2026-11-09T09:00:00Z", "2026-11-09T11:30:00Z"), { dueDateEnd: new Date("2026-11-09T11:30:00Z") }],
    ["renamed", block, timed("2026-11-09T09:00:00Z", "2026-11-09T10:00:00Z", { summary: "Write chapter 2" }), { title: "Write chapter 2" }],
    ["deleted: the task stays, unscheduled", block, { id: "e", status: "cancelled", updated: edited }, { dueDate: null, dueDateEnd: null, googleCalendarEventId: null }],
    ["all-day moved by days keeps its stored time", allDay, { id: "e", summary: "Pay rent", start: { date: "2026-11-11" }, end: { date: "2026-11-12" }, updated: edited }, { dueDate: new Date(2026, 10, 11) }],
    ["all-day given a time becomes a block", allDay, timed("2026-11-09T15:00:00Z", "2026-11-09T15:30:00Z", { summary: "Pay rent" }), { dueDate: new Date("2026-11-09T15:00:00Z"), dueDateEnd: new Date("2026-11-09T15:30:00Z") }],
    ["block moved to all day", block, { id: "e", summary: "Write", start: { date: "2026-11-10" }, end: { date: "2026-11-11" }, updated: edited }, { dueDate: new Date(2026, 10, 10), dueDateEnd: null }],
    // Echo suppression: our own push comes back with the task's values.
    ["echo of a timed push", block, timed("2026-11-09T09:00:00.000Z", "2026-11-09T10:00:00.000Z"), null],
    ["echo of an all-day push", allDay, { id: "e", summary: "Pay rent", start: { date: "2026-11-09" }, end: { date: "2026-11-10" }, updated: edited }, null],
    // Last write wins: an app edit after the Google edit keeps the task (and is pushed over it).
    ["older than the task's last edit", { ...block, updatedAt: new Date("2026-11-07T13:00:00Z") }, timed("2026-11-09T13:00:00Z", "2026-11-09T14:00:00Z"), null],
    ["deleted before the task's last edit", { ...block, updatedAt: new Date("2026-11-07T13:00:00Z") }, { id: "e", status: "cancelled", updated: edited }, null],
    ["blank title is not applied", block, timed("2026-11-09T09:00:00Z", "2026-11-09T10:00:00Z", { summary: "  " }), null],
  ])("%s", (_name, task, event, expected) => {
    expect(inboundPatch(task, event)).toEqual(expected);
  });
});

describe("incremental event listing", () => {
  const page = (items: InboundEvent[], next: { nextPageToken?: string; nextSyncToken?: string }) => ({ data: { items, ...next } });

  it("follows pages with the sync token and keeps the last token", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce(page([{ id: "a" }], { nextPageToken: "p2" }))
      .mockResolvedValueOnce(page([{ id: "b" }], { nextSyncToken: "sync-2" }));
    expect(await listEventChanges(list, "primary", "sync-1")).toEqual({ items: [{ id: "a" }, { id: "b" }], nextSyncToken: "sync-2", reset: false });
    expect(list.mock.calls.map(([params]) => [params.syncToken, params.pageToken, params.timeMin])).toEqual([["sync-1", undefined, undefined], ["sync-1", "p2", undefined]]);
  });

  it("an expired token (410) restarts as a full listing over the window and says so", async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { code: 410 }))
      .mockResolvedValueOnce(page([{ id: "a" }], { nextSyncToken: "fresh" }));
    const result = await listEventChanges(list, "primary", "stale", Date.UTC(2026, 10, 7));
    expect(result).toEqual({ items: [{ id: "a" }], nextSyncToken: "fresh", reset: true });
    expect(list.mock.calls[1][0].syncToken).toBeUndefined();
    expect(list.mock.calls[1][0]).toMatchObject({ timeMin: "2026-09-08T00:00:00.000Z", singleEvents: true });
  });

  it("other failures (and a 410 on a full listing) are the caller's", async () => {
    await expect(listEventChanges(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: 500 })), "primary", "t")).rejects.toThrow("x");
    await expect(listEventChanges(vi.fn().mockRejectedValue(Object.assign(new Error("y"), { code: 410 })), "primary", null)).rejects.toThrow("y");
  });
});
