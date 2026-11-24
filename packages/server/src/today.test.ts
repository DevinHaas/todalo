import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countTodayTasks, getOwnedTask, getTasksForUser, getTodayTasksForUser } from "./today";

const boundary = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  readGate: null as Promise<void> | null,
  onRead: () => {},
}));
// Run real query predicates at the relational database boundary; assertions
// observe only the reusable service's public result.
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  const adapter = await relationalBoundary(boundary);
  const select = adapter.db.select;
  adapter.db.select = fields => {
    const query = select(fields);
    const read = query.then;
    query.then = async (resolve, reject) => {
      boundary.onRead();
      await boundary.readGate;
      return read(resolve, reject);
    };
    return query;
  };
  return adapter;
});

beforeEach(() => {
  boundary.readGate = null;
  boundary.onRead = () => {};
  boundary.rows = {
    tasks: [
      { id: "alice-task", userId: "alice", status: "todo", dueDate: null, sortOrder: 0 },
      { id: "bob-task", userId: "bob", status: "todo", dueDate: null, sortOrder: 1 },
    ],
    task_labels: [
      { userId: "alice", taskId: "alice-task", labelId: "alice-label" },
      { userId: "bob", taskId: "alice-task", labelId: "private-label" },
    ],
  };
});
afterEach(() => vi.useRealTimers());

describe("Today server query", () => {
  it("uses the local day when a pending database read completes across midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59, 59));
    Object.assign(boundary.rows.tasks[0], { dueDate: new Date(2026, 9, 5, 12) });
    let releaseRead!: () => void;
    boundary.readGate = new Promise<void>(resolve => { releaseRead = resolve; });
    const readStarted = new Promise<void>(resolve => { boundary.onRead = resolve; });
    const pending = getTodayTasksForUser("alice");
    await readStarted;
    vi.setSystemTime(new Date(2026, 9, 5, 0, 0, 1));
    releaseRead();
    expect((await pending).openCount).toBe(1);
  });

  it("lets the page refresh its count when a later calendar read crosses midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 23, 59, 59));
    Object.assign(boundary.rows.tasks[0], { dueDate: new Date(2026, 9, 5, 12) });
    const result = await getTodayTasksForUser("alice");
    expect(result.openCount).toBe(0);
    // The task read is done; another parallel page read may still be pending.
    vi.setSystemTime(new Date(2026, 9, 5, 0, 0, 1));
    expect(countTodayTasks(result.tasks)).toBe(1);
    expect(result.tasks.map(task => task.id)).toEqual(["alice-task"]);
  });

  it("returns only the authenticated user's tasks and label associations", async () => {
    const result = await getTodayTasksForUser("alice");
    expect(result.tasks.map(task => [task.id, task.labelIds])).toEqual([["alice-task", ["alice-label"]]]);
    expect((await getTodayTasksForUser("bob")).tasks.map(task => task.id)).toEqual(["bob-task"]);
    expect(await getTodayTasksForUser("unknown")).toEqual({ tasks: [], openCount: 0 });
  });

  it.each([[2026, 9, 4], [2026, 2, 29], [2026, 9, 25]])(
    "counts the local day and overdue tasks across the %i/%i/%i boundary without filtering view data",
    async (year, month, day) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(year, month, day, 12));
      boundary.rows.tasks = [
        { id: "overdue", userId: "alice", status: "todo", dueDate: new Date(year, month, day - 1, 23, 59), sortOrder: 0 },
        { id: "midnight", userId: "alice", status: "todo", dueDate: new Date(year, month, day), sortOrder: 1 },
        { id: "later-today", userId: "alice", status: "in_progress", dueDate: new Date(year, month, day, 23, 59, 59, 999), sortOrder: 2 },
        { id: "tomorrow", userId: "alice", status: "todo", dueDate: new Date(year, month, day + 1), sortOrder: 3 },
        { id: "undated", userId: "alice", status: "todo", dueDate: null, sortOrder: 4 },
        { id: "completed", userId: "alice", status: "done", dueDate: new Date(year, month, day - 1), sortOrder: 5 },
        { id: "foreign", userId: "bob", status: "todo", dueDate: new Date(year, month, day), sortOrder: 6 },
      ];
      const result = await getTodayTasksForUser("alice");
      expect(result.openCount).toBe(3);
      expect(result.tasks.map(task => task.id)).toEqual([
        "overdue", "midnight", "later-today", "tomorrow", "undated", "completed",
      ]);
    },
  );

  it("opens only an owned task, treating foreign and missing IDs alike", async () => {
    expect(await getOwnedTask("alice", "alice-task")).toMatchObject({ id: "alice-task", labelIds: ["alice-label"] });
    expect(await getOwnedTask("bob", "alice-task")).toBeNull();
    expect(await getOwnedTask("alice", "missing")).toBeNull();
  });

  it("retains the optional project constraint used by legacy read callers", async () => {
    Object.assign(boundary.rows.tasks[0], { projectId: "work" });
    Object.assign(boundary.rows.tasks[1], { projectId: "work" });
    expect((await getTasksForUser("alice", "work")).map(task => task.id)).toEqual(["alice-task"]);
    expect(await getTasksForUser("alice", "unknown")).toEqual([]);
  });
});

describe("recentCollection", async () => {
  const { recentCollection } = await import("./today");
  const now = new Date("2026-11-24T12:00:00Z");
  const old = "2026-09-01T12:00:00Z", recent = "2026-11-20T12:00:00Z";
  const row = (id: string, status: string, completedAt: string | null, parentId: string | null = null) => ({ id, status, completedAt, parentId });
  it("drops tasks completed before the window unless an open tree shows them", () => {
    const rows = [
      row("open", "todo", null), row("recent", "done", recent), row("old", "done", old),
      // An open parent's old completed child (its progress) and its own done ancestor (breadcrumb).
      row("root", "done", old), row("parent", "todo", null, "root"), row("child-done", "done", old, "parent"),
      // An old completed tree with nothing open stays out.
      row("old-parent", "done", old), row("old-child", "done", old, "old-parent"),
    ];
    expect(recentCollection(rows, now).map(task => task.id)).toEqual(["open", "recent", "root", "parent", "child-done"]);
  });
});

describe("byManualOrder (merging the parallel Today reads)", async () => {
  const { byManualOrder } = await import("./today");
  it("orders like the SQL: sort order, then created_at to the microsecond, then ID by code point", () => {
    const row = (id: string, sortOrder: number | null, createdText: string) => ({ id, sortOrder, createdText });
    const rows = [
      row("b", 1, "2026-11-24 05:30:47.688123"), row("a", 1, "2026-11-24 05:30:47.688123"), row("c", 1, "2026-11-24 05:30:47.6881"),
      row("d", 1, "2026-11-24 05:30:47"), row("e", 0, "2026-12-01 00:00:00"), row("f", null, "2026-11-01 00:00:00"),
    ];
    expect([...rows].sort(byManualOrder).map(r => r.id)).toEqual(["f", "e", "d", "c", "a", "b"]);
  });
});

describe("readParts (TODAY_READ_PARTS)", async () => {
  const { readParts } = await import("./today");
  it("takes 1, 2, 4 or 8 and falls back to 4", () => {
    expect([undefined, "1", "2", "4", "8", "3", "0", "x", "16"].map(readParts)).toEqual([4, 1, 2, 4, 8, 4, 4, 4, 4]);
  });
});
