import { beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import { defaultProjectDisplay, parseProjectDisplay } from "@todalo/server/project-dto";
import { createProjectRoutes } from "./project-routes";

const dto = (id: string, name: string, color: string | null) => ({ id, name, color, description: null, favorite: false, archived: false, display: defaultProjectDisplay });

type Row = { id: string; userId: string; name: string; color: string | null; createdAt: Date; description?: string | null; favorite?: boolean; archivedAt?: Date | null; viewSettings?: unknown };
let projects: Row[] = [];
let tasks: (TaskRecord & { userId: string })[] = [];
const task = (id: string, userId: string, projectId: string | null): TaskRecord & { userId: string } => ({
  id, userId, title: id, description: null, status: "todo", priority: 4, projectId, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [],
});
beforeEach(() => {
  projects = [
    { id: "alice-work", userId: "alice", name: "Work", color: "blue", createdAt: new Date() },
    { id: "bob-home", userId: "bob", name: "Home", color: null, createdAt: new Date() },
  ];
  tasks = [task("in-work", "alice", "alice-work"), task("inbox", "alice", null), task("bob-in-work", "bob", "alice-work")];
});

const app = createProjectRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  list: async (userId) => projects.filter(project => project.userId === userId).map(project => ({ ...project, openCount: 2, completedCount: 1 })),
  get: async (userId, id) => projects.find(project => project.userId === userId && project.id === id) ?? null,
  tasks: async (userId, projectId) => tasks.filter(item => item.userId === userId && item.projectId === projectId),
  create: async (userId, input) => { const row = { id: `new-${input.name}`, userId, color: null, ...input, createdAt: new Date() }; projects.push(row); return row; },
  update: async (userId, id, { archived, display, ...input }) => {
    const row = projects.find(project => project.userId === userId && project.id === id);
    if (row) Object.assign(row, input, archived === undefined ? {} : { archivedAt: archived ? new Date() : null }, display ? { viewSettings: display } : {});
    return row ?? null;
  },
  remove: async (userId, id) => {
    const before = projects.length;
    projects = projects.filter(project => !(project.userId === userId && project.id === id));
    // Mirrors the schema's tasks.project_id ON DELETE SET NULL.
    if (projects.length < before) tasks.forEach(item => { if (item.projectId === id) item.projectId = null; });
    return projects.length < before;
  },
  // Sections and destinations: organization-routes.test.ts.
  sections: async () => [],
  createSection: async () => null,
  renameSection: async () => null,
  removeSection: async () => false,
  destinations: async () => ({ projects: [], sections: [] }),
});
const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};

describe("project API", () => {
  it("rejects every unauthenticated operation with the shared envelope", async () => {
    for (const [method, path] of [["GET", "/projects"], ["GET", "/projects/alice-work"], ["POST", "/projects"], ["PATCH", "/projects/alice-work"], ["DELETE", "/projects/alice-work"]]) {
      const response = await call(method, path, { origin: "http://localhost:5173", body: method === "POST" || method === "PATCH" ? { name: "x" } : undefined });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("lists only the session user's projects as allow-listed DTOs", async () => {
    const response = await call("GET", "/projects?userId=bob", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ projects: [{ ...dto("alice-work", "Work", "blue"), completedCount: 1, openCount: 2 }] });
  });

  it("opens a project with only the owner's member tasks; foreign and missing IDs share one 404", async () => {
    const owned = await call("GET", "/projects/alice-work", { user: "alice" });
    const body = await owned.json() as { project: object; tasks: { id: string }[] };
    expect(body.project).toEqual(dto("alice-work", "Work", "blue"));
    expect(body.tasks.map(item => item.id)).toEqual(["in-work"]);
    const foreign = await call("GET", "/projects/bob-home", { user: "alice" });
    const missing = await call("GET", "/projects/nope", { user: "alice" });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("creates and renames with trimmed, validated names", async () => {
    const created = await call("POST", "/projects", { user: "alice", body: { name: "  Errands ", userId: "bob" } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ project: dto("new-Errands", "Errands", null) });
    expect(projects.at(-1)?.userId).toBe("alice");
    const renamed = await call("PATCH", "/projects/alice-work", { user: "alice", body: { name: "Job" } });
    expect(await renamed.json()).toEqual({ project: dto("alice-work", "Job", "blue") });
    for (const body of [{ name: "  " }, { name: "x".repeat(201) }, {}]) {
      const response = await call("POST", "/projects", { user: "alice", body });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
  });

  it("adds a project with a colour and favorite", async () => {
    const created = await call("POST", "/projects", { user: "alice", body: { name: "Trips", color: "#4073ff", favorite: true } });
    expect(await created.json()).toEqual({ project: { ...dto("new-Trips", "Trips", "#4073ff"), favorite: true } });
    expect((await call("POST", "/projects", { user: "alice", body: { name: "Bad", color: "blue" } })).status).toBe(400);
  });

  it("edits only the fields sent: favorite, description, archive and Display", async () => {
    const edit = (body: unknown) => call("PATCH", "/projects/alice-work", { user: "alice", body });
    expect(await (await edit({ favorite: true, description: "Day job" })).json()).toEqual({ project: { ...dto("alice-work", "Work", "blue"), favorite: true, description: "Day job" } });
    // An empty description clears it; archiving keeps every other field.
    expect(await (await edit({ description: "  ", archived: true })).json()).toEqual({ project: { ...dto("alice-work", "Work", "blue"), favorite: true, archived: true } });
    expect((await (await edit({ archived: false })).json() as { project: { archived: boolean } }).project.archived).toBe(false);
    const display = { ...defaultProjectDisplay, layout: "board", priority: "1" };
    expect((await (await edit({ display })).json() as { project: { display: unknown } }).project.display).toEqual(display);
    for (const body of [{}, { display: { layout: "grid" } }, { archived: "yes" }, { description: "x".repeat(16_384) }, { userId: "bob" }]) {
      expect((await edit(body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    expect((await call("PATCH", "/projects/bob-home", { user: "alice", body: { archived: true } })).status).toBe(404);
    expect(projects.find(project => project.id === "bob-home")?.archivedAt).toBeUndefined();
  });

  it("reads Display settings stored by an older client with defaults filled in", () => {
    expect(parseProjectDisplay({ layout: "board", unknown: 1 })).toEqual({ ...defaultProjectDisplay, layout: "board" });
    expect(parseProjectDisplay({ layout: "nope" })).toEqual(defaultProjectDisplay);
  });

  it("cannot rename or delete another user's project", async () => {
    const rename = await call("PATCH", "/projects/bob-home", { user: "alice", body: { name: "Mine" } });
    const remove = await call("DELETE", "/projects/bob-home", { user: "alice" });
    expect([rename.status, remove.status]).toEqual([404, 404]);
    expect(projects.find(project => project.id === "bob-home")?.name).toBe("Home");
  });

  it("deletes a project while keeping its tasks, which move to Inbox", async () => {
    const response = await call("DELETE", "/projects/alice-work", { user: "alice" });
    expect(await response.json()).toEqual({ id: "alice-work" });
    expect(tasks.find(item => item.id === "in-work")?.projectId).toBeNull();
    expect((await call("GET", "/projects/alice-work", { user: "alice" })).status).toBe(404);
  });

  it("requires an allowed Origin for cookie-authenticated writes but not for bearer writes", async () => {
    expect((await call("POST", "/projects", { cookie: "alice", body: { name: "A" } })).status).toBe(403);
    const crossSite = await call("DELETE", "/projects/alice-work", { cookie: "alice", origin: "https://evil.example" });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
    expect((await call("POST", "/projects", { cookie: "alice", origin: "http://localhost:5173", body: { name: "A" } })).status).toBe(201);
    // A bearer request ignores any ambient cookie.
    expect((await call("POST", "/projects", { user: "bob", cookie: "alice", body: { name: "B" } })).status).toBe(201);
    expect(projects.at(-1)?.userId).toBe("bob");
  });
});
