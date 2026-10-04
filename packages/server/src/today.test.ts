import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countTodayTasks, getTasksForUser, getTodayTasksForUser } from "./today";

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

  it("retains the optional project constraint used by legacy read callers", async () => {
    Object.assign(boundary.rows.tasks[0], { projectId: "work" });
    Object.assign(boundary.rows.tasks[1], { projectId: "work" });
    expect((await getTasksForUser("alice", "work")).map(task => task.id)).toEqual(["alice-task"]);
    expect(await getTasksForUser("alice", "unknown")).toEqual([]);
  });
});
