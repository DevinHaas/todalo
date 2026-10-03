import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTasksForUser } from "@/lib/tasks";
import { createSection, getOrganizationDestinations, moveTasks, setTaskParent } from "./organization-actions";
import { createTask, updateTask } from "../tasks/actions";

const boundary = vi.hoisted(() => ({ userId: "alice" as string | null, rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => { if (!boundary.userId) throw new Error("Not authenticated"); return boundary.userId; } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// A small relational database boundary. Actions, schemas and ownership validators
// run unchanged; assertions read results through the same public action interface.
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("@/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

beforeEach(() => {
  boundary.userId = "alice";
  boundary.rows = {
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "foreign", userId: "bob", name: "Private" }],
    sections: [{ id: "todo", userId: "alice", projectId: "work", name: "To do" }, { id: "foreign-section", userId: "bob", projectId: "foreign", name: "Private" }],
    tasks: [{ id: "parent", userId: "alice", title: "Parent", projectId: "work", sectionId: "todo", parentId: null }, { id: "child", userId: "alice", title: "Child", projectId: "work", sectionId: "todo", parentId: "parent" }, { id: "other", userId: "alice", title: "Other", projectId: null, sectionId: null, parentId: null }, { id: "foreign-task", userId: "bob", title: "Private", projectId: "foreign", sectionId: null, parentId: null }],
  };
});
describe("authenticated organization actions", () => {
  it("returns minimal owned destination data", async () => {
    const data = await getOrganizationDestinations();
    expect(Object.keys(data.projects[0]).sort()).toEqual(["id", "name"]);
    expect(Object.keys(data.sections[0]).sort()).toEqual(["id", "name", "projectId"]);
    const section = await createSection("work", "Minimal");
    expect(Object.keys(section).sort()).toEqual(["id", "name", "projectId"]);
  });
  it("guards project and section ownership on the existing task create/update interface", async () => {
    await expect(createTask({ title: "Forbidden", projectId: "foreign" })).rejects.toThrow("Project not found");
    await expect(updateTask({ id: "parent", sectionId: "foreign-section" })).rejects.toThrow("Section not found");
    await expect(updateTask({ id: "other", parentId: "parent", projectId: "foreign" })).rejects.toThrow("Project not found");
    await createTask({ title: "Review", projectId: "work", sectionId: "todo" });
    expect((await getTasksForUser("alice")).find(task => task.title === "Review")).toMatchObject({ projectId: "work", sectionId: "todo" });
  });
  it("keeps direct task creation and editing in the parent's organization", async () => {
    await createTask({ title: "Nested", parentId: "parent" });
    expect((await getTasksForUser("alice")).find(task => task.title === "Nested")).toMatchObject({ parentId: "parent", projectId: "work", sectionId: "todo" });
    await updateTask({ id: "other", parentId: "parent" });
    expect((await getTasksForUser("alice")).find(task => task.id === "other")).toMatchObject({ parentId: "parent", projectId: "work", sectionId: "todo" });
  });
  it("carries children when an existing editor changes the parent's destination", async () => {
    await updateTask({ id: "parent", projectId: null });
    expect((await getTasksForUser("alice")).find(task => task.id === "child")).toMatchObject({ projectId: null, sectionId: null, parentId: "parent" });
  });
  it("creates sections retrievable only from the signed-in account", async () => {
    await createSection("work", "Review");
    expect((await getOrganizationDestinations()).sections.map(section => section.name)).toEqual(["To do", "Review"]);
    boundary.userId = "bob";
    expect((await getOrganizationDestinations()).sections.map(section => section.name)).toEqual(["Private"]);
  });
  it("rejects cross-account and inconsistent destinations before any move", async () => {
    await expect(moveTasks(["parent"], { projectId: "foreign", sectionId: null })).rejects.toThrow("Project not found");
    await expect(moveTasks(["parent"], { projectId: "work", sectionId: "foreign-section" })).rejects.toThrow("Section not found");
    await expect(moveTasks(["parent", "foreign-task"], { projectId: null, sectionId: null })).rejects.toThrow("Task not found");
    expect((await getTasksForUser("alice")).find(task => task.id === "parent")?.projectId).toBe("work");
  });
  it("moves parent and child together, and detaches a separately moved child", async () => {
    await moveTasks(["parent"], { projectId: null, sectionId: null });
    expect((await getTasksForUser("alice")).slice(0, 2).map(task => [task.projectId, task.sectionId, task.parentId])).toEqual([[null, null, null], [null, null, "parent"]]);
    await moveTasks(["child"], { projectId: "work", sectionId: "todo" });
    expect((await getTasksForUser("alice")).find(task => task.id === "child")?.parentId).toBeNull();
  });
  it("nests into the parent's organization and rejects depth or foreign parents", async () => {
    await setTaskParent("other", "parent");
    expect((await getTasksForUser("alice")).find(task => task.id === "other")).toMatchObject({ parentId: "parent", projectId: "work", sectionId: "todo" });
    await expect(setTaskParent("other", "child")).rejects.toThrow("Sub-tasks cannot have sub-tasks");
    await expect(setTaskParent("other", "foreign-task")).rejects.toThrow("Parent task not found");
    await setTaskParent("other", null);
    expect((await getTasksForUser("alice")).find(task => task.id === "other")?.parentId).toBeNull();
  });
  it("rejects unsigned requests at every action", async () => {
    boundary.userId = null;
    await expect(createSection("work", "Review")).rejects.toThrow("Not authenticated");
    await expect(getOrganizationDestinations()).rejects.toThrow("Not authenticated");
    await expect(moveTasks(["parent"], { projectId: null, sectionId: null })).rejects.toThrow("Not authenticated");
    await expect(setTaskParent("other", null)).rejects.toThrow("Not authenticated");
  });
});
