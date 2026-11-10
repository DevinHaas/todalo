import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, getOwnedProject, getProjectsForUser, updateProject } from "./projects";
import { defaultProjectDisplay, parseProjectName, toProjectDto } from "./project-dto";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

beforeEach(() => {
  boundary.rows = { projects: [
    { id: "alice-work", userId: "alice", name: "Work", color: "blue" },
    { id: "bob-home", userId: "bob", name: "Home", color: null },
  ] };
});

describe("shared project operations", () => {
  it("reads only the owner's projects and treats foreign IDs as missing", async () => {
    expect((await getProjectsForUser("alice")).map(project => project.id)).toEqual(["alice-work"]);
    expect(await getOwnedProject("alice", "alice-work")).toMatchObject({ name: "Work" });
    expect(await getOwnedProject("alice", "bob-home")).toBeNull();
    expect(await getOwnedProject("alice", "missing")).toBeNull();
  });

  it("creates for the session user and renames without touching color", async () => {
    expect(await createProject("alice", { name: "Errands" })).toMatchObject({ userId: "alice", name: "Errands" });
    expect(await updateProject("alice", "alice-work", { name: "Job" })).toMatchObject({ name: "Job", color: "blue" });
  });

  it("edits only the fields sent: favorite, description, archive and Display", async () => {
    const display = { ...defaultProjectDisplay, layout: "table" as const };
    expect(await updateProject("alice", "alice-work", { favorite: true, description: "Day job", display })).toMatchObject({ name: "Work", color: "blue", favorite: true, description: "Day job", viewSettings: display });
    expect((await updateProject("alice", "alice-work", { archived: true }))?.archivedAt).toBeInstanceOf(Date);
    expect(await updateProject("alice", "alice-work", { archived: false })).toMatchObject({ archivedAt: null, favorite: true });
    expect(await updateProject("alice", "bob-home", { archived: true })).toBeNull();
    expect(boundary.rows.projects.find(project => project.id === "bob-home")?.archivedAt).toBeUndefined();
  });

  it("refuses to rename or delete another user's project", async () => {
    expect(await updateProject("alice", "bob-home", { name: "Taken" })).toBeNull();
    expect(await deleteProject("alice", "bob-home")).toBe(false);
    expect(boundary.rows.projects.find(project => project.id === "bob-home")).toMatchObject({ name: "Home" });
    expect(await deleteProject("alice", "alice-work")).toBe(true);
    expect(boundary.rows.projects.map(project => project.id)).toEqual(["bob-home"]);
  });
});

describe("project DTO", () => {
  it("allow-lists fields and validates names like the legacy action", () => {
    expect(toProjectDto({ id: "p", name: "Work", color: null, userId: "alice", createdAt: new Date() } as never)).toEqual({ id: "p", name: "Work", color: null, description: null, favorite: false, archived: false, display: defaultProjectDisplay });
    expect(parseProjectName({ name: "  Work  " })).toBe("Work");
    for (const body of [{ name: "   " }, { name: "x".repeat(201) }, { name: 3 }, {}, null, "Work"]) expect(parseProjectName(body)).toBeNull();
    expect(parseProjectName({ name: "x".repeat(200) })).toHaveLength(200);
  });
});
