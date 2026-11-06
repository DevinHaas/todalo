import { beforeEach, describe, expect, it } from "vitest";
import { planReorder } from "@todalo/server/bulk-input";
import { createGoalRoutes } from "./goal-routes";

type Row = { id: string; userId: string; title: string; description: string | null; sortOrder: number; archivedAt: Date | null };
let goals: Row[] = [];
let hidden: Map<string, boolean>;
// Projects and tasks the links point at; unlinking must never remove these.
const projects = [{ id: "alice-run", userId: "alice", name: "Run marathon", color: null }, { id: "alice-meals", userId: "alice", name: "Meal prep", color: null }, { id: "bob-books", userId: "bob", name: "Books", color: null }];
const task = (id: string, userId: string, title: string, projectId: string | null = null, labelIds: string[] = []) => ({ id, userId, title, description: null, status: "todo" as const, priority: 4, projectId, parentId: null, dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds });
const tasks = [task("alice-protein", "alice", "Eat enough protein"), task("alice-stretch", "alice", "Stretch"), task("bob-page", "bob", "Read a page"),
  // Ticket 03 suggestions: three runs share a project; the stretch-like task shares a label.
  task("alice-run-1", "alice", "5k", "alice-run"), task("alice-run-2", "alice", "10k", "alice-run"), task("alice-run-3", "alice", "Long run", "alice-run", ["legs"]),
  task("alice-squats", "alice", "Squats", "alice-meals", ["legs"]), task("bob-run", "bob", "Bob's run", "alice-run")];
let dismissals: { userId: string; taskId: string; goalId: string }[] = [];
let links: { goalId: string; kind: "projects" | "tasks"; targetId: string }[] = [];
beforeEach(() => {
  links = [];
  dismissals = [];
  goals = [
    { id: "alice-fit", userId: "alice", title: "Become fit", description: "Run a marathon", sortOrder: 0, archivedAt: null },
    { id: "alice-v2", userId: "alice", title: "Ship v2", description: null, sortOrder: 1, archivedAt: null },
    { id: "alice-old", userId: "alice", title: "Old goal", description: null, sortOrder: 2, archivedAt: new Date() },
    { id: "bob-read", userId: "bob", title: "Read more", description: null, sortOrder: 0, archivedAt: null },
  ];
  hidden = new Map();
});

// In-memory mirror of packages/server/src/goals.ts.
const active = (userId: string) => goals.filter(goal => goal.userId === userId && !goal.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
const find = (userId: string, id: string) => goals.find(goal => goal.userId === userId && goal.id === id) ?? null;
const app = createGoalRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  list: async (userId) => active(userId),
  get: async (userId, id) => find(userId, id),
  create: async (userId, input) => {
    const row = { id: `new-${input.title}`, userId, title: input.title, description: input.description ?? null, sortOrder: goals.length, archivedAt: null };
    goals.push(row);
    return row;
  },
  update: async (userId, id, { archived, ...fields }) => {
    const row = find(userId, id);
    if (!row) return null;
    Object.assign(row, fields, archived === undefined ? {} : { archivedAt: archived ? new Date() : null });
    return row;
  },
  reorder: async (userId, id, move) => {
    const next = planReorder(active(userId).map(goal => goal.id), id, move.anchorId, move.position);
    next?.forEach((goalId, index) => { find(userId, goalId)!.sortOrder = index; });
    return next !== null;
  },
  hidden: async (userId) => hidden.get(userId) ?? false,
  setHidden: async (userId, value) => { hidden.set(userId, value); return value; },
  work: async (userId, goalId) => {
    const linked = (kind: string) => new Set(links.filter(link => link.goalId === goalId && link.kind === kind).map(link => link.targetId));
    return { projects: projects.filter(project => project.userId === userId && linked("projects").has(project.id)), tasks: tasks.filter(item => item.userId === userId && linked("tasks").has(item.id)) };
  },
  links: async (userId) => {
    const mine = links.filter(link => find(userId, link.goalId));
    return { projects: mine.filter(link => link.kind === "projects").map(link => ({ goalId: link.goalId, projectId: link.targetId })), tasks: mine.filter(link => link.kind === "tasks").map(link => ({ goalId: link.goalId, taskId: link.targetId })) };
  },
  link: async (userId, goalId, kind, targetId) => {
    if (!find(userId, goalId) || !(kind === "projects" ? projects : tasks).some(row => row.userId === userId && row.id === targetId)) return false;
    if (!links.some(link => link.goalId === goalId && link.kind === kind && link.targetId === targetId)) links.push({ goalId, kind, targetId });
    return true;
  },
  unlink: async (userId, goalId, kind, targetId) => {
    if (!find(userId, goalId)) return false;
    links = links.filter(link => !(link.goalId === goalId && link.kind === kind && link.targetId === targetId));
    return true;
  },
  tasks: async (userId) => tasks.filter(item => item.userId === userId),
  dismissed: async (userId, taskId) => dismissals.filter(row => row.userId === userId && row.taskId === taskId).map(row => row.goalId),
  dismiss: async (userId, taskId, goalId) => {
    if (!find(userId, goalId) || !tasks.some(row => row.userId === userId && row.id === taskId)) return false;
    if (!dismissals.some(row => row.taskId === taskId && row.goalId === goalId)) dismissals.push({ userId, taskId, goalId });
    return true;
  },
  // Milestones: milestone-routes.test.ts.
  milestone: async () => null,
  setMilestone: async () => "missing",
  clearMilestone: async () => false,
  milestones: async () => [],
});
const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const sidebar = async (user = "alice") => (await (await call("GET", "/goals", { user })).json()) as { goals: { id: string; title: string }[]; hidden: boolean };

describe("goal API", () => {
  it("rejects every unauthenticated operation with the shared envelope", async () => {
    for (const [method, path, body] of [["GET", "/goals"], ["GET", "/goals/alice-fit"], ["POST", "/goals", { title: "x" }], ["PATCH", "/goals/alice-fit", { title: "x" }],
      ["POST", "/goals/alice-fit/reorder", { anchorId: "alice-v2", position: "after" }], ["PUT", "/goals-visibility", { hidden: true }],
      ["GET", "/goal-links"], ["PUT", "/goals/alice-fit/tasks/alice-protein"], ["DELETE", "/goals/alice-fit/projects/alice-run"]] as const) {
      const response = await call(method, path, { origin: "http://localhost:5173", body });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("lists only the session user's active goals, in order, as allow-listed DTOs", async () => {
    const response = await call("GET", "/goals?userId=bob", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ hidden: false, goals: [
      { id: "alice-fit", title: "Become fit", description: "Run a marathon", archived: false },
      { id: "alice-v2", title: "Ship v2", description: null, archived: false },
    ] });
  });

  it("opens a goal page (archived ones too); foreign and missing IDs share one 404", async () => {
    expect(await (await call("GET", "/goals/alice-fit", { user: "alice" })).json()).toEqual({ goal: { id: "alice-fit", title: "Become fit", description: "Run a marathon", archived: false }, projects: [], tasks: [], milestones: [] });
    expect((await (await call("GET", "/goals/alice-old", { user: "alice" })).json() as { goal: { archived: boolean } }).goal.archived).toBe(true);
    const foreign = await call("GET", "/goals/bob-read", { user: "alice" });
    const missing = await call("GET", "/goals/nope", { user: "alice" });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("creates with a trimmed title and optional description, for the session user only", async () => {
    const created = await call("POST", "/goals", { user: "alice", body: { title: "  Build muscle ", description: " Lift 3x a week " } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ goal: { id: "new-Build muscle", title: "Build muscle", description: "Lift 3x a week", archived: false } });
    expect((await sidebar()).goals.at(-1)?.id).toBe("new-Build muscle");
    for (const body of [{ title: "  " }, { title: "x".repeat(201) }, {}, { title: "A", userId: "bob" }, { title: "A", description: "x".repeat(10_001) }]) {
      const response = await call("POST", "/goals", { user: "alice", body });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
  });

  it("renames and edits the description; an empty description clears it", async () => {
    const renamed = await call("PATCH", "/goals/alice-fit", { user: "alice", body: { title: "Get fit" } });
    expect(await renamed.json()).toEqual({ goal: { id: "alice-fit", title: "Get fit", description: "Run a marathon", archived: false } });
    const described = await call("PATCH", "/goals/alice-fit", { user: "alice", body: { description: "  " } });
    expect(await described.json()).toEqual({ goal: { id: "alice-fit", title: "Get fit", description: null, archived: false } });
    expect((await call("PATCH", "/goals/alice-fit", { user: "alice", body: {} })).status).toBe(400);
  });

  it("archiving removes a goal from the sidebar but keeps its data", async () => {
    const archived = await call("PATCH", "/goals/alice-fit", { user: "alice", body: { archived: true } });
    expect(await archived.json()).toEqual({ goal: { id: "alice-fit", title: "Become fit", description: "Run a marathon", archived: true } });
    expect((await sidebar()).goals.map(goal => goal.id)).toEqual(["alice-v2"]);
    expect(goals.find(goal => goal.id === "alice-fit")).toMatchObject({ title: "Become fit", description: "Run a marathon" });
    expect((await call("GET", "/goals/alice-fit", { user: "alice" })).status).toBe(200);
  });

  it("reorders the sidebar; archived, foreign and missing anchors are a 404", async () => {
    const moved = await call("POST", "/goals/alice-fit/reorder", { user: "alice", body: { anchorId: "alice-v2", position: "after" } });
    expect(await moved.json()).toEqual({ id: "alice-fit" });
    expect((await sidebar()).goals.map(goal => goal.id)).toEqual(["alice-v2", "alice-fit"]);
    for (const [id, anchorId] of [["alice-fit", "bob-read"], ["alice-fit", "alice-old"], ["bob-read", "alice-fit"], ["alice-fit", "alice-fit"]]) {
      expect((await call("POST", `/goals/${id}/reorder`, { user: "alice", body: { anchorId, position: "before" } })).status, `${id} → ${anchorId}`).toBe(404);
    }
    expect((await call("POST", "/goals/alice-fit/reorder", { user: "alice", body: { anchorId: "alice-v2", position: "middle" } })).status).toBe(400);
    expect((await sidebar()).goals.map(goal => goal.id)).toEqual(["alice-v2", "alice-fit"]);
  });

  it("cannot edit or archive another user's goal", async () => {
    const rename = await call("PATCH", "/goals/bob-read", { user: "alice", body: { title: "Mine", archived: true } });
    expect(rename.status).toBe(404);
    expect(goals.find(goal => goal.id === "bob-read")).toMatchObject({ title: "Read more", archivedAt: null });
  });

  it("hiding goals is per account and leaves the goals themselves alone", async () => {
    const response = await call("PUT", "/goals-visibility", { user: "alice", body: { hidden: true } });
    expect(await response.json()).toEqual({ hidden: true });
    expect(await sidebar()).toMatchObject({ hidden: true, goals: [{ id: "alice-fit" }, { id: "alice-v2" }] });
    expect((await sidebar("bob")).hidden).toBe(false);
    for (const body of [{}, { hidden: "yes" }, { hidden: true, userId: "bob" }]) expect((await call("PUT", "/goals-visibility", { user: "alice", body })).status).toBe(400);
  });

  it("requires an allowed Origin for cookie-authenticated writes but not for bearer writes", async () => {
    expect((await call("POST", "/goals", { cookie: "alice", body: { title: "A" } })).status).toBe(403);
    const crossSite = await call("PUT", "/goals-visibility", { cookie: "alice", origin: "https://evil.example", body: { hidden: true } });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
    expect(hidden.has("alice")).toBe(false);
    expect((await call("POST", "/goals", { cookie: "alice", origin: "http://localhost:5173", body: { title: "A" } })).status).toBe(201);
    expect((await call("POST", "/goals", { user: "bob", cookie: "alice", body: { title: "B" } })).status).toBe(201);
    expect(goals.at(-1)?.userId).toBe("bob");
  });

  describe("links", () => {
    const linked = async (goal: string) => (await (await call("GET", `/goals/${goal}`, { user: "alice" })).json()) as { projects: { id: string; name: string }[]; tasks: { id: string; title: string }[] };

    it("links one goal to many projects and one project to many goals", async () => {
      for (const [goal, project] of [["alice-fit", "alice-run"], ["alice-fit", "alice-meals"], ["alice-v2", "alice-run"]]) {
        const response = await call("PUT", `/goals/${goal}/projects/${project}`, { user: "alice" });
        expect(await response.json()).toEqual({ goalId: goal, kind: "projects", targetId: project });
      }
      expect((await linked("alice-fit")).projects).toEqual([{ id: "alice-run", name: "Run marathon", color: null }, { id: "alice-meals", name: "Meal prep", color: null }]);
      expect((await linked("alice-v2")).projects.map(project => project.id)).toEqual(["alice-run"]);
    });

    it("links one task to several goals; the goal page lists it as a task DTO", async () => {
      await call("PUT", "/goals/alice-fit/tasks/alice-protein", { user: "alice" });
      await call("PUT", "/goals/alice-v2/tasks/alice-protein", { user: "alice" });
      await call("PUT", "/goals/alice-fit/tasks/alice-stretch", { user: "alice" });
      expect((await linked("alice-fit")).tasks).toMatchObject([{ id: "alice-protein", title: "Eat enough protein", labelIds: [] }, { id: "alice-stretch" }]);
      expect((await linked("alice-fit")).tasks[0]).not.toHaveProperty("userId");
      expect((await linked("alice-v2")).tasks.map(item => item.id)).toEqual(["alice-protein"]);
      expect(await (await call("GET", "/goal-links", { user: "alice" })).json()).toEqual({ projects: [], tasks: [
        { goalId: "alice-fit", taskId: "alice-protein" }, { goalId: "alice-v2", taskId: "alice-protein" }, { goalId: "alice-fit", taskId: "alice-stretch" },
      ] });
    });

    it("linking twice keeps one link", async () => {
      await call("PUT", "/goals/alice-fit/tasks/alice-protein", { user: "alice" });
      expect((await call("PUT", "/goals/alice-fit/tasks/alice-protein", { user: "alice" })).status).toBe(200);
      expect((await linked("alice-fit")).tasks).toHaveLength(1);
    });

    it("unlinking removes only the link, never the task or project", async () => {
      await call("PUT", "/goals/alice-fit/tasks/alice-protein", { user: "alice" });
      await call("PUT", "/goals/alice-fit/projects/alice-run", { user: "alice" });
      await call("PUT", "/goals/alice-v2/tasks/alice-protein", { user: "alice" });
      expect((await call("DELETE", "/goals/alice-fit/tasks/alice-protein", { user: "alice" })).status).toBe(200);
      expect((await call("DELETE", "/goals/alice-fit/projects/alice-run", { user: "alice" })).status).toBe(200);
      expect(await linked("alice-fit")).toMatchObject({ projects: [], tasks: [] });
      expect((await linked("alice-v2")).tasks.map(item => item.id)).toEqual(["alice-protein"]);
      expect(tasks.map(item => item.id)).toContain("alice-protein");
      expect(projects.map(project => project.id)).toContain("alice-run");
      // Already unlinked: still a success.
      expect((await call("DELETE", "/goals/alice-fit/tasks/alice-protein", { user: "alice" })).status).toBe(200);
    });

    it("refuses foreign or missing goals, projects and tasks with one 404, and unknown kinds", async () => {
      for (const [method, path] of [["PUT", "/goals/bob-read/tasks/alice-protein"], ["PUT", "/goals/alice-fit/tasks/bob-page"], ["PUT", "/goals/alice-fit/projects/bob-books"],
        ["PUT", "/goals/alice-fit/tasks/nope"], ["PUT", "/goals/alice-fit/labels/alice-protein"], ["DELETE", "/goals/bob-read/tasks/bob-page"], ["DELETE", "/goals/nope/projects/alice-run"]] as const) {
        const response = await call(method, path, { user: "alice" });
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(await response.json()).toEqual({ code: "NOT_FOUND", message: "This goal does not exist or you do not have access to it." });
      }
      expect(links).toEqual([]);
      expect(await (await call("GET", "/goal-links", { user: "bob" })).json()).toEqual({ projects: [], tasks: [] });
    });

    it("requires an allowed Origin for cookie-authenticated link writes", async () => {
      expect((await call("PUT", "/goals/alice-fit/tasks/alice-protein", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
      expect((await call("DELETE", "/goals/alice-fit/tasks/alice-protein", { cookie: "alice" })).status).toBe(403);
      expect(links).toEqual([]);
      expect((await call("PUT", "/goals/alice-fit/tasks/alice-protein", { cookie: "alice", origin: "http://localhost:5173" })).status).toBe(200);
    });
  });

  describe("suggestions", () => {
    const suggested = async (taskId: string, user = "alice") => ((await (await call("GET", `/tasks/${taskId}/goal-suggestions`, { user })).json()) as { goalIds: string[] }).goalIds;
    const linkTask = (goalId: string, taskId: string) => links.push({ goalId, kind: "tasks", targetId: taskId });

    it("suggests goals that same-project and same-label tasks link to, most frequent first", async () => {
      linkTask("alice-v2", "alice-run-1");
      linkTask("alice-fit", "alice-run-2");
      linkTask("alice-fit", "alice-squats");
      // run-3: v2 once by project; fit by project (run-2) and label (squats).
      expect(await suggested("alice-run-3")).toEqual(["alice-fit", "alice-v2"]);
      // Unrelated task: no hint.
      expect(await suggested("alice-protein")).toEqual([]);
    });

    it("never links on its own; accepting is the explicit link and ends the suggestions", async () => {
      linkTask("alice-fit", "alice-run-1");
      expect(await suggested("alice-run-2")).toEqual(["alice-fit"]);
      expect(links).toHaveLength(1);
      expect((await call("PUT", "/goals/alice-fit/tasks/alice-run-2", { user: "alice" })).status).toBe(200);
      expect(await suggested("alice-run-2")).toEqual([]);
    });

    it("suggests a goal linked to the task's own project, weighted above one sibling link", async () => {
      linkTask("alice-fit", "alice-run-1");
      links.push({ goalId: "alice-v2", kind: "projects", targetId: "alice-run" });
      expect(await suggested("alice-run-2")).toEqual(["alice-v2", "alice-fit"]);
      expect(links).toHaveLength(2);
    });

    it("skips archived goals", async () => {
      linkTask("alice-old", "alice-run-1");
      expect(await suggested("alice-run-2")).toEqual([]);
    });

    it("dismissing hides that suggestion for that task only and creates no link", async () => {
      linkTask("alice-fit", "alice-run-1");
      linkTask("alice-v2", "alice-run-1");
      const response = await call("DELETE", "/tasks/alice-run-2/goal-suggestions/alice-fit", { user: "alice" });
      expect(await response.json()).toEqual({ taskId: "alice-run-2", goalId: "alice-fit" });
      expect(await suggested("alice-run-2")).toEqual(["alice-v2"]);
      expect(await suggested("alice-run-3")).toEqual(["alice-fit", "alice-v2"]);
      expect(links).toHaveLength(2);
      // Dismissing twice is still a success.
      expect((await call("DELETE", "/tasks/alice-run-2/goal-suggestions/alice-fit", { user: "alice" })).status).toBe(200);
    });

    it("shows no suggestions while Goals is hidden", async () => {
      linkTask("alice-fit", "alice-run-1");
      hidden.set("alice", true);
      expect(await suggested("alice-run-2")).toEqual([]);
    });

    it("keeps users apart: foreign tasks and goals are a 404 and other users' links never count", async () => {
      linkTask("alice-fit", "alice-run-1");
      expect(await suggested("bob-run", "bob")).toEqual([]);
      const read = await call("GET", "/tasks/alice-run-2/goal-suggestions", { user: "bob" });
      expect(read.status).toBe(404);
      expect(await read.json()).toEqual({ code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." });
      for (const path of ["/tasks/bob-run/goal-suggestions/alice-fit", "/tasks/alice-run-2/goal-suggestions/bob-read", "/tasks/nope/goal-suggestions/alice-fit"]) {
        expect((await call("DELETE", path, { user: "alice" })).status, path).toBe(404);
      }
      expect(dismissals).toEqual([]);
    });

    it("requires a session, and an allowed Origin for cookie-authenticated dismissals", async () => {
      expect((await call("GET", "/tasks/alice-run-2/goal-suggestions")).status).toBe(401);
      expect((await call("DELETE", "/tasks/alice-run-2/goal-suggestions/alice-fit", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
      expect(dismissals).toEqual([]);
      expect((await call("DELETE", "/tasks/alice-run-2/goal-suggestions/alice-fit", { cookie: "alice", origin: "http://localhost:5173" })).status).toBe(200);
    });
  });
});
