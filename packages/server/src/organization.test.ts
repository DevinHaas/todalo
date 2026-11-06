import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import { createSection, deleteSection, getOrganizationDestinations, getSectionsForUser, moveTasks } from "./organization";
import { updateTask } from "./tasks";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});
vi.mock("./calendar", () => ({ pushTaskToCalendar: async () => null, deleteTaskFromCalendar: async () => {} }));

const SEEN = new Date("2026-10-04T08:00:00.000Z");
const task = (id: string) => boundary.rows.tasks.find(row => row.id === id);
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, userId: "alice", title: id, status: "todo", projectId: "work", sectionId: "doing", parentId: null, dueDate: null, recurrence: null, sortOrder: 0, updatedAt: SEEN, ...extra });
const reason = (promise: Promise<unknown>) => promise.then(() => "resolved", (error: unknown) => error instanceof TaskOrganizationError ? error.reason : String(error));

beforeEach(() => {
  boundary.rows = {
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "home", userId: "alice", name: "Home" }, { id: "bob-project", userId: "bob", name: "Private" }],
    sections: [
      { id: "later", userId: "alice", projectId: "work", name: "Later", sortOrder: 1 },
      { id: "doing", userId: "alice", projectId: "work", name: "Doing", sortOrder: 0 },
      { id: "garden", userId: "alice", projectId: "home", name: "Garden", sortOrder: 0 },
      { id: "bob-section", userId: "bob", projectId: "bob-project", name: "Private", sortOrder: 0 },
    ],
    tasks: [
      row("parent"), row("child", { parentId: "parent" }), row("loose"), row("inbox", { projectId: null, sectionId: null }),
      row("bob-task", { userId: "bob", projectId: "bob-project", sectionId: null }),
    ],
  };
});

describe("sections", () => {
  // The boundary ignores ORDER BY (sortOrder, name), so membership is what is checked here.
  it("lists only the owner's sections of a project and exposes minimal destinations", async () => {
    expect((await getSectionsForUser("alice", "work")).map(section => section.id).sort()).toEqual(["doing", "later"]);
    expect(await getOrganizationDestinations("bob")).toEqual({ projects: [{ id: "bob-project", name: "Private" }], sections: [{ id: "bob-section", projectId: "bob-project", name: "Private" }] });
  });

  it("creates a trimmed section only in an owned project", async () => {
    expect(await createSection("alice", "work", "  Review ")).toMatchObject({ projectId: "work", name: "Review" });
    expect(await reason(createSection("alice", "bob-project", "Mine"))).toBe("missing");
    await expect(createSection("alice", "work", " ")).rejects.toThrow();
    expect(boundary.rows.sections.filter(section => section.userId === "alice")).toHaveLength(4);
  });

  it("deletes only the owner's section", async () => {
    expect(await deleteSection("alice", "bob-section")).toBe(false);
    expect(await deleteSection("alice", "later")).toBe(true);
    expect(boundary.rows.sections.map(section => section.id)).not.toContain("later");
  });
});

describe("one task's organization through updateTask", () => {
  // The copy the editor last saw: a cascaded move ($onUpdate) also changes a sub-task's updatedAt.
  const edit = (id: string, change: Record<string, unknown>) => updateTask("alice", { id, ...change }, { seenUpdatedAt: (task(id)?.updatedAt as Date | undefined) ?? SEEN });

  it("moves a parent with its sub-tasks and detaches a sub-task moved alone", async () => {
    expect(await edit("parent", { projectId: "home", sectionId: "garden" })).toBe("updated");
    expect(task("child")).toMatchObject({ projectId: "home", sectionId: "garden", parentId: "parent" });
    expect(await edit("child", { projectId: null, sectionId: null })).toBe("updated");
    expect(task("child")).toMatchObject({ projectId: null, sectionId: null, parentId: null });
  });

  it("nests into the parent's project and section, and un-nests in place", async () => {
    expect(await edit("inbox", { parentId: "loose" })).toBe("updated");
    expect(task("inbox")).toMatchObject({ parentId: "loose", projectId: "work", sectionId: "doing" });
    expect(await edit("child", { parentId: null })).toBe("updated");
    expect(task("child")).toMatchObject({ parentId: null, projectId: "work", sectionId: "doing" });
  });

  it("refuses cycles and depth as invalid, foreign or mismatched destinations as missing", async () => {
    expect(await reason(edit("loose", { parentId: "loose" }))).toBe("invalid");
    expect(await reason(edit("loose", { parentId: "child" }))).toBe("invalid");
    expect(await reason(edit("parent", { parentId: "loose" }))).toBe("invalid");
    expect(await reason(edit("loose", { parentId: "bob-task" }))).toBe("missing");
    expect(await reason(edit("loose", { projectId: "bob-project", sectionId: null }))).toBe("missing");
    expect(await reason(edit("loose", { projectId: "home", sectionId: "doing" }))).toBe("missing");
    expect(await reason(edit("loose", { projectId: "work", sectionId: "bob-section" }))).toBe("missing");
    expect(task("loose")).toMatchObject({ projectId: "work", sectionId: "doing", parentId: null });
  });

  it("refuses a move from a stale copy unless it already applied", async () => {
    const stale = { seenUpdatedAt: new Date("2026-10-01T00:00:00.000Z") };
    expect(await updateTask("alice", { id: "loose", projectId: "home", sectionId: null }, stale)).toBe("changed");
    expect(await updateTask("alice", { id: "loose", projectId: "work", sectionId: "doing" }, stale)).toBe("updated");
  });
});

describe("moveTasks (several tasks)", () => {
  it("carries sub-tasks of moved parents and detaches sub-tasks moved without them", async () => {
    await moveTasks("alice", ["parent", "loose"], { projectId: "home", sectionId: null });
    expect([task("parent"), task("child"), task("loose")].map(item => item?.projectId)).toEqual(["home", "home", "home"]);
    await moveTasks("alice", ["child"], { projectId: null, sectionId: null });
    expect(task("child")).toMatchObject({ projectId: null, parentId: null });
    await expect(moveTasks("alice", ["loose", "bob-task"], { projectId: null, sectionId: null })).rejects.toThrow("Task not found");
    expect(task("bob-task")?.projectId).toBe("bob-project");
  });
});
