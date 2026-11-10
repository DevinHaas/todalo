// Ticket 13 routes: sections and destinations (project-routes.ts) and one task's
// move or parent change (PATCH /tasks/:id → organize). The organization rules
// themselves run against the database boundary in packages/server.
import { beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import type { SectionDto } from "@todalo/server/project-dto";
import type { TaskOrganizationInput } from "@todalo/server/organization-input";
import { createProjectRoutes } from "./project-routes";
import { createTaskRoutes } from "./task-routes";

const ORIGIN = "http://localhost:5173";
const VERSION = "2026-10-04T08:00:00.000Z";
type Section = SectionDto & { userId: string };
let sections: Section[] = [];
let organized: TaskOrganizationInput[] = [];
const task: TaskRecord & { userId: string } = {
  id: "alice-task", userId: "alice", title: "Plan", description: null, status: "todo", priority: 4, projectId: "work", sectionId: "doing", parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], updatedAt: new Date(VERSION),
};
const projects = [{ id: "work", userId: "alice", name: "Work", color: null }, { id: "bob-project", userId: "bob", name: "Private", color: null }];
beforeEach(() => {
  sections = [{ id: "doing", userId: "alice", projectId: "work", name: "Doing" }, { id: "bob-section", userId: "bob", projectId: "bob-project", name: "Private" }];
  organized = [];
});

const verify = async (headers: Headers) => headers.get("authorization")?.replace("Bearer ", "") ?? (headers.get("cookie")?.replace("session=", "") || null);
const ownedProject = (userId: string, id: string) => projects.find(project => project.userId === userId && project.id === id) ?? null;
const projectApp = createProjectRoutes({
  verify, allowedOrigins: new Set([ORIGIN]),
  list: async (userId) => projects.filter(project => project.userId === userId),
  get: async (userId, id) => ownedProject(userId, id),
  tasks: async (userId, projectId) => userId === task.userId && projectId === task.projectId ? [task] : [],
  create: async () => { throw new Error("unused"); },
  update: async () => null,
  remove: async () => false,
  sections: async (userId, projectId) => sections.filter(section => section.userId === userId && section.projectId === projectId),
  createSection: async (userId, projectId, name, after) => {
    if (!ownedProject(userId, projectId)) return null;
    const section = { id: `new-${name}`, userId, projectId, name };
    // `after`: placed after that section, or first for null.
    sections.splice(after === undefined ? sections.length : after === null ? 0 : sections.findIndex(item => item.id === after) + 1, 0, section);
    return section;
  },
  renameSection: async (userId, id, name) => {
    const section = sections.find(item => item.userId === userId && item.id === id);
    if (section) section.name = name;
    return section ?? null;
  },
  removeSection: async (userId, id) => {
    const before = sections.length;
    sections = sections.filter(section => !(section.userId === userId && section.id === id));
    return sections.length < before;
  },
  destinations: async (userId) => ({ projects: projects.filter(project => project.userId === userId), sections: sections.filter(section => section.userId === userId) }),
});
// Fake organize: the outcome is chosen by the requested parent, so each route mapping is visible.
const taskApp = createTaskRoutes({
  verify, allowedOrigins: new Set([ORIGIN]),
  today: async () => ({ tasks: [], openCount: 0 }),
  task: async () => null,
  create: async () => null,
  complete: async () => null,
  update: async () => { throw new Error("details must not reach update"); },
  organize: async (userId, id, change) => {
    organized.push(change);
    if (userId !== task.userId || id !== task.id) return null;
    if ("parentId" in change) return change.parentId === "foreign" ? null : change.parentId === "own-child" ? "invalid" : change.parentId === "stale" ? "changed" : { ...task, parentId: change.parentId };
    return { ...task, projectId: change.projectId, sectionId: change.sectionId };
  },
  remove: async () => false,
});
const call = (app: { handle(request: Request): Promise<Response> }, method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) =>
  app.handle(new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: { ...(init.user && { authorization: `Bearer ${init.user}` }), ...(init.cookie && { cookie: `session=${init.cookie}` }), ...(init.origin && { origin: init.origin }), ...(init.body !== undefined && { "content-type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }));

describe("sections and destinations", () => {
  it("opens a project with its sections and tasks with their section", async () => {
    const body = await (await call(projectApp, "GET", "/projects/work", { user: "alice" })).json() as { sections: unknown[]; tasks: { sectionId: string | null }[] };
    expect(body.sections).toEqual([{ id: "doing", projectId: "work", name: "Doing" }]);
    expect(body.tasks[0].sectionId).toBe("doing");
  });

  it("lists only the session user's destinations as allow-listed DTOs", async () => {
    const response = await call(projectApp, "GET", "/destinations?userId=bob", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ projects: [{ id: "work", name: "Work" }], sections: [{ id: "doing", projectId: "work", name: "Doing" }] });
    expect((await call(projectApp, "GET", "/destinations")).status).toBe(401);
  });

  it("creates a trimmed section in an owned project; a foreign project is the shared 404", async () => {
    const created = await call(projectApp, "POST", "/projects/work/sections", { user: "alice", body: { name: "  Review " } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ section: { id: "new-Review", projectId: "work", name: "Review" } });
    const foreign = await call(projectApp, "POST", "/projects/bob-project/sections", { user: "alice", body: { name: "Mine" } });
    const missing = await call(projectApp, "POST", "/projects/nope/sections", { user: "alice", body: { name: "Mine" } });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
    for (const body of [{ name: " " }, { name: "x".repeat(201) }, { name: "A", projectId: "bob-project" }, {}]) {
      expect((await call(projectApp, "POST", "/projects/work/sections", { user: "alice", body })).status).toBe(400);
    }
    expect(sections.filter(section => section.projectId === "bob-project")).toHaveLength(1);
  });

  it("places a new section after another, or first", async () => {
    await call(projectApp, "POST", "/projects/work/sections", { user: "alice", body: { name: "Next", after: "doing" } });
    await call(projectApp, "POST", "/projects/work/sections", { user: "alice", body: { name: "First", after: null } });
    expect(sections.filter(section => section.projectId === "work").map(section => section.name)).toEqual(["First", "Doing", "Next"]);
  });

  it("renames only the owner's section with a validated name", async () => {
    const renamed = await call(projectApp, "PATCH", "/sections/doing", { user: "alice", body: { name: " Done " } });
    expect(await renamed.json()).toEqual({ section: { id: "doing", projectId: "work", name: "Done" } });
    expect((await call(projectApp, "PATCH", "/sections/bob-section", { user: "alice", body: { name: "Mine" } })).status).toBe(404);
    expect((await call(projectApp, "PATCH", "/sections/doing", { user: "alice", body: { name: " " } })).status).toBe(400);
    expect((await call(projectApp, "PATCH", "/sections/doing", { cookie: "alice", origin: "https://evil.example", body: { name: "X" } })).status).toBe(403);
    expect(sections.find(section => section.id === "bob-section")?.name).toBe("Private");
  });

  it("deletes only the owner's section and guards cookie writes", async () => {
    expect((await call(projectApp, "DELETE", "/sections/bob-section", { user: "alice" })).status).toBe(404);
    expect((await call(projectApp, "DELETE", "/sections/doing", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call(projectApp, "DELETE", "/sections/doing", { origin: ORIGIN })).status).toBe(401);
    const deleted = await call(projectApp, "DELETE", "/sections/doing", { cookie: "alice", origin: ORIGIN });
    expect(await deleted.json()).toEqual({ id: "doing" });
    expect(sections.map(section => section.id)).toEqual(["bob-section"]);
  });
});

describe("PATCH /tasks/:id organization", () => {
  it("moves through organize and returns the task DTO with its section", async () => {
    const response = await call(taskApp, "PATCH", "/tasks/alice-task", { user: "alice", body: { updatedAt: VERSION, projectId: null, sectionId: null } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ task: { id: "alice-task", projectId: null, sectionId: null } });
    expect(organized).toEqual([{ updatedAt: VERSION, projectId: null, sectionId: null }]);
  });

  it("maps refused parents: foreign 404, hierarchy rule 400, stale copy 412", async () => {
    const parent = (parentId: string | null, user = "alice") => call(taskApp, "PATCH", "/tasks/alice-task", { user, body: { updatedAt: VERSION, parentId } });
    expect((await parent("loose")).status).toBe(200);
    expect((await parent(null)).status).toBe(200);
    const [foreign, otherUser] = [await parent("foreign"), await parent("loose", "bob")];
    expect([foreign.status, otherUser.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual({ code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." });
    expect(await (await parent("own-child")).json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    expect((await parent("stale")).status).toBe(412);
  });

  it("refuses bodies that mix a move, a parent and details, or put Inbox tasks in a section", async () => {
    for (const body of [
      { updatedAt: VERSION, projectId: "work", sectionId: null, parentId: null },
      { updatedAt: VERSION, projectId: "work", sectionId: null, title: "x" },
      { updatedAt: VERSION, projectId: null, sectionId: "doing" },
      { updatedAt: VERSION, projectId: "work" },
      { projectId: "work", sectionId: null },
    ]) expect((await call(taskApp, "PATCH", "/tasks/alice-task", { user: "alice", body })).status, JSON.stringify(body)).toBe(400);
    expect(organized).toEqual([]);
  });

  it("guards cookie organization writes like every task write", async () => {
    const body = { updatedAt: VERSION, parentId: null };
    expect((await call(taskApp, "PATCH", "/tasks/alice-task", { cookie: "alice", body })).status).toBe(403);
    expect((await call(taskApp, "PATCH", "/tasks/alice-task", { cookie: "alice", origin: ORIGIN, body })).status).toBe(200);
  });
});
