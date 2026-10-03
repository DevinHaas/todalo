import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, updateTask } from "./actions";
import { createLabel, getMetadata, saveFilter, bulkTaskMetadata, getTaskEditorData } from "./metadata-actions";
import { getTasksForUser, getOwnedTask } from "@/lib/tasks";

const boundary = vi.hoisted(() => ({ userId: "alice" as string | null, rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => { if (!boundary.userId) throw new Error("Not authenticated"); return boundary.userId; } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("@/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});
beforeEach(() => {
  boundary.userId = "alice"; boundary.rows = {
    tasks: [{ id: "task", userId: "alice", title: "Review", projectId: null, sectionId: null, parentId: null, priority: 4 }, { id: "foreign-task", userId: "bob", title: "Private", priority: 4 }],
    labels: [{ id: "urgent", userId: "alice", name: "Urgent" }, { id: "foreign-label", userId: "bob", name: "Private" }], projects: [{ id: "foreign-project", userId: "bob" }],
  };
});
describe("authenticated metadata persistence", () => {
  it("reopens an editor with fresh metadata and preserves it when changing description", async () => {
    await bulkTaskMetadata({ ids: ["task"], deadline: new Date("2026-10-10") });
    const fresh = await getTaskEditorData("task");
    expect(fresh.deadline).toEqual(new Date("2026-10-10"));
    expect(fresh).not.toHaveProperty("userId");
    await updateTask({ id: "task", description: "Updated after deadline", deadline: fresh.deadline });
    expect((await getTaskEditorData("task")).deadline).toEqual(new Date("2026-10-10"));
    await expect(getTaskEditorData("foreign-task")).rejects.toThrow("Task not found");
  });
  it("returns only directory fields needed by the UI", async () => {
    await saveFilter({ name: "Open tasks", definition: { status: "open", due: "any" } });
    const data = await getMetadata();
    expect(Object.keys(data.labels[0]).sort()).toEqual(["color", "id", "name"]);
    expect(Object.keys(data.filters[0]).sort()).toEqual(["definition", "id", "name"]);
  });
  it("creates labeled tasks and retrieves edited description, deadline and priority through task reads", async () => {
    const id = await createTask({ title: "Plan", priority: 1, labelIds: ["urgent"] });
    await updateTask({ id, description: "A complete plan", deadline: new Date("2026-10-10"), priority: 2 });
    expect(await getOwnedTask("alice", id)).toMatchObject({ description: "A complete plan", priority: 2, deadline: new Date("2026-10-10"), labelIds: ["urgent"] });
    expect(await getOwnedTask("bob", id)).toBeNull();
  });
  it("rejects foreign labels and mixed selections before any metadata update", async () => {
    await expect(updateTask({ id: "task", priority: 1, labelIds: ["foreign-label"] })).rejects.toThrow("Label not found");
    await expect(bulkTaskMetadata({ ids: ["task", "foreign-task"], priority: 1 })).rejects.toThrow("Task not found");
    expect((await getTasksForUser("alice"))[0].priority).toBe(4);
  });
  it("persists account labels and bounded saved filters while rejecting foreign associations", async () => {
    await createLabel({ name: "Home" });
    await saveFilter({ name: "Urgent work", definition: { labelId: "urgent", priority: 1, status: "open", due: "any" } });
    expect((await getMetadata()).filters[0].name).toBe("Urgent work");
    await expect(saveFilter({ name: "Forbidden", definition: { labelId: "foreign-label", status: "any", due: "any" } })).rejects.toThrow("Label not found");
    await expect(saveFilter({ name: "Forbidden", definition: { projectId: "foreign-project", status: "any", due: "any" } })).rejects.toThrow("Project not found");
    boundary.userId = "bob"; expect((await getMetadata()).labels.map(label => label.name)).toEqual(["Private"]);
  });
});
