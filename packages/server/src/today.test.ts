import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTasksForUser, getTodayTasksForUser } from "./today";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
// Run real query predicates at the relational database boundary; assertions
// observe only the reusable service's public result.
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

beforeEach(() => {
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
