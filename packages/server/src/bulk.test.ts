import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearTaskDates, completeTasks, deleteTasks, reorderTask, updateTasksMetadata } from "./bulk";
import { planReorder } from "./bulk-input";
import { moveTasks } from "./organization";
import { MissingReferenceError } from "./metadata-input";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, calendar: [] as string[] }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});
vi.mock("./calendar", () => ({
  pushTaskToCalendar: async (_userId: string, task: { id: string }) => { boundary.calendar.push(`push:${task.id}`); return null; },
  deleteTaskFromCalendar: async (_userId: string, eventId: string) => { boundary.calendar.push(`delete:${eventId}`); },
}));

const SEEN = new Date("2026-10-04T08:00:00.000Z");
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, userId: "alice", title: id, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null, dueDate: null, dueDateEnd: null,
  deadline: null, recurrence: null, lastCompletionId: null, googleCalendarEventId: null, sortOrder: 0, createdAt: SEEN, updatedAt: SEEN, ...extra,
});
const task = (id: string) => boundary.rows.tasks.find(item => item.id === id);
// The boundary ignores ORDER BY, so rows are kept in manual order and read back by sortOrder.
const order = (projectId: string | null) => boundary.rows.tasks.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
  .filter(item => item.userId === "alice" && item.projectId === projectId).map(item => item.id);
const snapshot = () => structuredClone(boundary.rows);

beforeEach(() => {
  boundary.calendar = [];
  boundary.rows = {
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "home", userId: "alice", name: "Home" }],
    sections: [{ id: "garden", userId: "alice", projectId: "home", name: "Garden", sortOrder: 0 }],
    labels: [{ id: "design", userId: "alice", name: "Design" }, { id: "urgent", userId: "alice", name: "Urgent" }, { id: "bob-label", userId: "bob", name: "Private" }],
    task_labels: [{ userId: "alice", taskId: "a", labelId: "urgent" }],
    tasks: [
      row("a", { sortOrder: 0, dueDate: new Date("2026-10-05T09:00:00.000Z"), googleCalendarEventId: "event-a" }),
      row("b", { sortOrder: 1, dueDate: new Date("2026-10-06T00:00:00.000Z"), recurrence: { n: 1, unit: "day", basedOn: "scheduled" } }),
      row("c", { sortOrder: 2 }),
      row("d", { sortOrder: 3 }),
      row("home-1", { projectId: "home", sortOrder: 5 }),
      row("inbox", { projectId: null, sortOrder: 0 }),
      row("bob-task", { userId: "bob", projectId: null, sortOrder: 0 }),
    ],
  };
});

describe("planReorder", () => {
  it("places a task before or after an anchor and refuses unknown or identical tasks", () => {
    expect(planReorder(["a", "b", "c", "d"], "d", "a", "before")).toEqual(["d", "a", "b", "c"]);
    expect(planReorder(["a", "b", "c", "d"], "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    // Already in place: the same order, so a retry is a no-op.
    expect(planReorder(["b", "c", "a", "d"], "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    expect(planReorder(["a", "b"], "a", "a", "after")).toBeNull();
    expect(planReorder(["a", "b"], "a", "x", "after")).toBeNull();
  });
});

describe("reorderTask", () => {
  it("renumbers the collection relative to the current order and is safe to retry", async () => {
    expect(await reorderTask("alice", "d", "a", "after")).toBe("reordered");
    expect(order("work")).toEqual(["a", "d", "b", "c"]);
    expect(await reorderTask("alice", "d", "a", "after")).toBe("reordered");
    expect(order("work")).toEqual(["a", "d", "b", "c"]);
    // Moving another task keeps the earlier move (relative, not a client copy of the list).
    expect(await reorderTask("alice", "c", "a", "before")).toBe("reordered");
    expect(order("work")).toEqual(["c", "a", "d", "b"]);
    expect(task("home-1")?.sortOrder).toBe(5);
    expect(task("d")?.updatedAt).toEqual(SEEN);
  });

  it("writes nothing for a missing or foreign task or anchor, or across collections", async () => {
    const before = snapshot();
    expect(await reorderTask("alice", "a", "bob-task", "after")).toBe("missing");
    expect(await reorderTask("alice", "bob-task", "inbox", "after")).toBe("missing");
    expect(await reorderTask("alice", "a", "gone", "before")).toBe("missing");
    expect(await reorderTask("alice", "a", "home-1", "before")).toBe("invalid");
    expect(boundary.rows).toEqual(before);
  });
});

describe("bulk actions are all-or-nothing on ownership", () => {
  it("a selection with another user's task writes nothing", async () => {
    const before = snapshot();
    expect(await completeTasks("alice", [{ id: "a", occurrence: null }, { id: "bob-task", occurrence: null }], "11111111-1111-4111-8111-111111111111")).toBe("missing");
    expect(await deleteTasks("alice", ["c", "bob-task"])).toBe(false);
    expect(await clearTaskDates("alice", ["a", "bob-task"])).toBe(false);
    expect(await updateTasksMetadata("alice", ["c", "bob-task"], { priority: 1, labelIds: ["design"] })).toBe(false);
    await expect(moveTasks("alice", ["c", "bob-task"], { projectId: "home", sectionId: null })).rejects.toThrow("Task not found");
    expect(boundary.rows).toEqual(before);
    expect(boundary.calendar).toEqual([]);
  });

  it("completes each task once per tap and reports tasks changed elsewhere", async () => {
    const tap = "22222222-2222-4222-8222-222222222222";
    const items = [{ id: "a", occurrence: new Date("2026-10-05T09:00:00.000Z") }, { id: "b", occurrence: new Date("2026-10-06T00:00:00.000Z") }, { id: "c", occurrence: new Date("2026-10-09T00:00:00.000Z") }];
    expect(await completeTasks("alice", items, tap)).toEqual({ completed: ["a", "b"], changed: ["c"] });
    const advanced = task("b")?.dueDate;
    expect(task("a")?.status).toBe("done");
    expect(advanced).toEqual(new Date("2026-10-07T00:00:00.000Z"));
    // A retry of the same tap (response lost) advances the recurring task no further.
    expect(await completeTasks("alice", items, tap)).toEqual({ completed: ["a", "b"], changed: ["c"] });
    expect(task("b")?.dueDate).toEqual(advanced);
    expect(task("c")?.status).toBe("todo");
  });

  it("deletes and clears dates for owned selections with their calendar effects", async () => {
    expect(await clearTaskDates("alice", ["a", "b"])).toBe(true);
    expect([task("a")?.dueDate, task("b")?.dueDate, task("b")?.dueDateEnd]).toEqual([null, null, null]);
    expect(boundary.calendar).toEqual(["push:a", "push:b"]);
    expect(await deleteTasks("alice", ["a", "c", "a"])).toBe(true);
    expect([task("a"), task("c")]).toEqual([undefined, undefined]);
    expect(boundary.calendar).toContain("delete:event-a");
    // A repeated delete finds the tasks gone.
    expect(await deleteTasks("alice", ["a", "c"])).toBe(false);
  });

  it("sets one metadata field on every task and replaces labels; a foreign label writes nothing", async () => {
    expect(await updateTasksMetadata("alice", ["a", "c"], { priority: 2 })).toBe(true);
    expect([task("a")?.priority, task("c")?.priority, task("d")?.priority]).toEqual([2, 2, 4]);
    expect(await updateTasksMetadata("alice", ["a", "c"], { labelIds: ["design"] })).toBe(true);
    expect(boundary.rows.task_labels.map(link => `${link.taskId}:${link.labelId}`).sort()).toEqual(["a:design", "c:design"]);
    const before = snapshot();
    await expect(updateTasksMetadata("alice", ["a"], { labelIds: ["bob-label"] })).rejects.toBeInstanceOf(MissingReferenceError);
    expect(boundary.rows).toEqual(before);
  });

  it("moves a selection to the end of the destination in its current order, atomically", async () => {
    await moveTasks("alice", ["c", "a"], { projectId: "home", sectionId: "garden" });
    expect(order("home")).toEqual(["home-1", "a", "c"]);
    expect(task("a")).toMatchObject({ projectId: "home", sectionId: "garden" });
    // A retry re-applies the same values.
    await moveTasks("alice", ["c", "a"], { projectId: "home", sectionId: "garden" });
    expect(order("home")).toEqual(["home-1", "a", "c"]);
  });
});
