import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeTask, createTask, deleteTask, TaskIdConflictError, updateTask } from "./tasks";

const boundary = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  calendar: [] as string[],
}));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});
// Provider boundary: record each calendar effect instead of calling Google.
vi.mock("./calendar", () => ({
  pushTaskToCalendar: async (_userId: string, task: { id: string }) => { boundary.calendar.push(`push:${task.id}`); return { googleCalendarEventId: `event-${task.id}` }; },
  deleteTaskFromCalendar: async (_userId: string, eventId: string) => { boundary.calendar.push(`delete:${eventId}`); },
}));

const OPERATION = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
const task = (id: string) => boundary.rows.tasks.find(row => row.id === id);

beforeEach(() => {
  boundary.calendar = [];
  boundary.rows = {
    tasks: [
      { id: "alice-task", userId: "alice", title: "Mine", status: "todo", dueDate: null, completedAt: null, recurrence: null, googleCalendarEventId: "alice-event", sortOrder: 0 },
      { id: "bob-task", userId: "bob", title: "Private", status: "todo", dueDate: null, completedAt: null, recurrence: null, googleCalendarEventId: "bob-event", sortOrder: 0 },
    ],
  };
});

describe("createTask", () => {
  it("answers a retried create with the original task and repeats no side effects", async () => {
    const input = { id: OPERATION, title: "Plan", dueDate: new Date(2026, 9, 15) };
    expect(await createTask("alice", input)).toEqual({ id: OPERATION, created: true });
    expect(await createTask("alice", input)).toEqual({ id: OPERATION, created: false });
    expect(boundary.rows.tasks.filter(row => row.id === OPERATION)).toHaveLength(1);
    expect(boundary.calendar).toEqual([`push:${OPERATION}`]);
    expect(task(OPERATION)).toMatchObject({ userId: "alice", title: "Plan", googleCalendarEventId: `event-${OPERATION}` });
  });

  it("refuses a task ID that belongs to another user without touching that task", async () => {
    await expect(createTask("alice", { id: OPERATION, title: "Plan" })).resolves.toEqual({ id: OPERATION, created: true });
    await expect(createTask("bob", { id: OPERATION, title: "Hijack" })).rejects.toBeInstanceOf(TaskIdConflictError);
    expect(task(OPERATION)).toMatchObject({ userId: "alice", title: "Plan" });
  });

  it("keeps legacy validation: a title is required and IDs must be UUIDs", async () => {
    await expect(createTask("alice", { title: "" })).rejects.toThrow();
    await expect(createTask("alice", { id: "../x", title: "Plan" })).rejects.toThrow();
    expect(boundary.rows.tasks).toHaveLength(2);
  });

  it("creates an undated Inbox task without a calendar write", async () => {
    const { id, created } = await createTask("alice", { title: "Someday" });
    expect(created).toBe(true);
    expect(task(id)).toMatchObject({ userId: "alice", title: "Someday" });
    expect(task(id)?.projectId ?? null).toBeNull();
    expect(boundary.calendar).toEqual([]);
  });
});

describe("completeTask", () => {
  it("completes an owned task once; a replay keeps the original completion time", async () => {
    expect(await completeTask("alice", "alice-task")).toBe("completed");
    const first = task("alice-task")!.completedAt;
    expect(task("alice-task")).toMatchObject({ status: "done" });
    await new Promise(resolve => setTimeout(resolve, 2));
    expect(await completeTask("alice", "alice-task")).toBe("completed");
    expect(task("alice-task")!.completedAt).toBe(first);
  });

  it("treats another user's task as missing and leaves it open", async () => {
    expect(await completeTask("alice", "bob-task")).toBe("missing");
    expect(await completeTask("alice", "missing")).toBe("missing");
    expect(task("bob-task")).toMatchObject({ status: "todo", completedAt: null });
  });

  const daily = { n: 1, unit: "day", basedOn: "scheduled" };
  const TAP = "0b6f2f8e-1c1a-4f4e-8a55-3a3d6e1c2b10";

  it("advances a recurring task once when a completion for the same occurrence is replayed", async () => {
    const occurrence = new Date(2026, 9, 15);
    Object.assign(task("alice-task")!, { dueDate: occurrence, recurrence: daily });
    expect(await completeTask("alice", "alice-task", { occurrence })).toBe("completed");
    expect(await completeTask("alice", "alice-task", { occurrence })).toBe("completed");
    expect(task("alice-task")).toMatchObject({ status: "todo", dueDate: new Date(2026, 9, 16) });
    expect(boundary.calendar).toEqual(["push:alice-task"]);
  });

  it("recognises a retried tap by its operation ID and refuses a tap on a date another device changed", async () => {
    const occurrence = new Date(2026, 9, 15);
    Object.assign(task("alice-task")!, { dueDate: occurrence, recurrence: daily });
    expect(await completeTask("alice", "alice-task", { occurrence, operationId: OPERATION })).toBe("completed");
    expect(task("alice-task")).toMatchObject({ dueDate: new Date(2026, 9, 16), lastCompletionId: OPERATION, completedAt: null });
    // The response was lost and the client retries the same tap.
    expect(await completeTask("alice", "alice-task", { occurrence, operationId: OPERATION })).toBe("completed");
    // Another device moved the task to 20 Oct; a tap made from the 16 Oct copy is stale.
    task("alice-task")!.dueDate = new Date(2026, 9, 20);
    expect(await completeTask("alice", "alice-task", { occurrence: new Date(2026, 9, 16), operationId: TAP })).toBe("changed");
    expect(task("alice-task")).toMatchObject({ status: "todo", dueDate: new Date(2026, 9, 20), lastCompletionId: OPERATION });
    expect(boundary.calendar).toEqual(["push:alice-task"]);
  });

  it("lets only one of two concurrent completions of the same occurrence advance the task", async () => {
    const occurrence = new Date(2026, 9, 15);
    Object.assign(task("alice-task")!, { dueDate: occurrence, recurrence: daily });
    const results = await Promise.all([
      completeTask("alice", "alice-task", { occurrence, operationId: OPERATION }),
      completeTask("alice", "alice-task", { occurrence, operationId: TAP }),
    ]);
    expect(results.sort()).toEqual(["changed", "completed"]);
    expect(task("alice-task")).toMatchObject({ dueDate: new Date(2026, 9, 16) });
    expect(boundary.calendar).toEqual(["push:alice-task"]);
  });

  it("completes the final occurrence once until has passed, without a calendar write", async () => {
    Object.assign(task("alice-task")!, { dueDate: new Date(2026, 9, 15), recurrence: { ...daily, until: new Date(2026, 9, 15).toISOString() } });
    expect(await completeTask("alice", "alice-task", { occurrence: new Date(2026, 9, 15), operationId: OPERATION })).toBe("completed");
    expect(task("alice-task")).toMatchObject({ status: "done", dueDate: new Date(2026, 9, 15) });
    expect(boundary.calendar).toEqual([]);
  });
});

describe("updateTask", () => {
  const seen = new Date("2026-10-15T08:00:00.000Z");
  beforeEach(() => { Object.assign(task("alice-task")!, { updatedAt: seen, description: null, priority: 4, deadline: null, dueDateEnd: null }); });
  const details = { id: "alice-task", title: "Renamed", description: "Notes", priority: 2, dueDate: new Date(2026, 9, 20, 9), dueDateEnd: new Date(2026, 9, 20, 10), deadline: null, recurrence: { n: 1, unit: "week" as const, basedOn: "scheduled" as const } };

  it("saves details and the schedule, pushing the due date to the calendar as the legacy action did", async () => {
    expect(await updateTask("alice", details, { seenUpdatedAt: seen })).toBe("updated");
    expect(task("alice-task")).toMatchObject({ title: "Renamed", description: "Notes", priority: 2, dueDate: new Date(2026, 9, 20, 9), recurrence: details.recurrence });
    expect((task("alice-task")!.updatedAt as Date).getTime()).toBeGreaterThan(seen.getTime());
    expect(boundary.calendar).toEqual(["push:alice-task"]);
    // An edit without a due date (title only) leaves the calendar alone.
    await updateTask("alice", { id: "alice-task", title: "Again" });
    expect(boundary.calendar).toEqual(["push:alice-task"]);
  });

  it("treats a retried edit as applied but refuses an edit from a copy another device changed", async () => {
    expect(await updateTask("alice", details, { seenUpdatedAt: seen })).toBe("updated");
    expect(await updateTask("alice", details, { seenUpdatedAt: seen })).toBe("updated");
    expect(await updateTask("alice", { ...details, title: "Overwrite" }, { seenUpdatedAt: seen })).toBe("changed");
    expect(task("alice-task")).toMatchObject({ title: "Renamed" });
  });

  it("treats another user's and missing tasks as missing", async () => {
    expect(await updateTask("alice", { ...details, id: "bob-task" })).toBe("missing");
    expect(await updateTask("alice", { ...details, id: "nope" })).toBe("missing");
    expect(task("bob-task")).toMatchObject({ title: "Private" });
    expect(boundary.calendar).toEqual([]);
  });
});

describe("deleteTask", () => {
  it("deletes an owned task and its calendar event; another user's task is missing", async () => {
    expect(await deleteTask("alice", "bob-task")).toBe(false);
    expect(task("bob-task")).toBeDefined();
    expect(await deleteTask("alice", "alice-task")).toBe(true);
    expect(task("alice-task")).toBeUndefined();
    expect(boundary.calendar).toEqual(["delete:alice-event"]);
    expect(await deleteTask("alice", "alice-task")).toBe(false);
  });
});
