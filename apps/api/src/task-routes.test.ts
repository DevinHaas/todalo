import { beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import { createTaskRoutes } from "./task-routes";

type Row = TaskRecord & { userId: string };
const row = (id: string, userId: string, extra: Partial<TaskRecord> = {}): Row => ({
  id, userId, title: `${userId} task`, description: null, status: "todo" as const, priority: 4,
  projectId: null, parentId: null, dueDate: new Date("2026-10-04T12:30:00.000Z"), dueDateEnd: null,
  deadline: null, completedAt: null, labelIds: ["label"], googleCalendarEventId: "private-event", sortOrder: 3, ...extra,
} as Row);
let rows: Row[] = [];
const seen: string[] = [];
const completions: (Date | null | undefined)[] = [];
beforeEach(() => { rows = [row("alice-task", "alice"), row("bob-task", "bob")]; completions.length = 0; });

const owned = (userId: string, id: string) => rows.find(task => task.userId === userId && task.id === id) ?? null;
const ORIGIN = "http://localhost:5173";
const app = createTaskRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? (headers.get("cookie")?.replace("session=", "") || null),
  today: async (userId) => { seen.push(userId); return { tasks: rows.filter(task => task.userId === userId), openCount: 1 }; },
  task: async (userId, id) => owned(userId, id),
  allowedOrigins: new Set([ORIGIN]),
  // Operation-ID semantics of @todalo/server/tasks (covered against the database boundary there).
  create: async (userId, input) => {
    const existing = rows.find(task => task.id === input.id);
    if (existing) return existing.userId === userId ? { task: existing, created: false } : null;
    const task = row(input.id, userId, { title: input.title, description: input.description ?? null, dueDate: input.dueDate ?? null, labelIds: [] });
    rows.push(task);
    return { task, created: true };
  },
  complete: async (userId, id, occurrence) => {
    completions.push(occurrence);
    const task = owned(userId, id);
    if (task) Object.assign(task, { status: "done", completedAt: new Date("2026-10-04T13:00:00.000Z") });
    return task;
  },
  remove: async (userId, id) => { const task = owned(userId, id); rows = rows.filter(item => item !== task); return Boolean(task); },
});
const get = (path: string, user?: string) => app.handle(new Request(`http://localhost${path}`, user ? { headers: { authorization: `Bearer ${user}` } } : {}));
const send = (method: string, path: string, { user, body, cookie, origin }: { user?: string; body?: unknown; cookie?: string; origin?: string } = {}) =>
  app.handle(new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(user && { authorization: `Bearer ${user}` }), ...(cookie && { cookie: `session=${cookie}` }), ...(origin && { origin }),
      ...(body !== undefined && { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  }));
const ID = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";

describe("task read API", () => {
  it("rejects unauthenticated reads with the shared error envelope", async () => {
    for (const path of ["/api/v1/today", "/api/v1/tasks/alice-task"]) {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("returns only the session user's Today collection as explicit date DTOs", async () => {
    seen.length = 0;
    const response = await get("/api/v1/today?userId=bob", "alice");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(seen).toEqual(["alice"]);
    expect(await response.json()).toEqual({ openCount: 1, tasks: [{
      id: "alice-task", title: "alice task", description: null, status: "todo", priority: 4, projectId: null, parentId: null,
      dueDate: "2026-10-04T12:30:00.000Z", dueDateEnd: null, deadline: null, completedAt: null, labelIds: ["label"],
    }] });
  });

  it("opens an owned task and treats another user's task as missing", async () => {
    const owned = await get("/api/v1/tasks/alice-task", "alice");
    expect(owned.status).toBe(200);
    expect(((await owned.json()) as { task: object }).task).not.toHaveProperty("userId");
    const foreign = await get("/api/v1/tasks/bob-task", "alice");
    const missing = await get("/api/v1/tasks/nope", "alice");
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
  });
});

describe("task write API", () => {
  it("creates a task for the session user only and answers a replay with the same task", async () => {
    const body = { id: ID, title: "Plan", dueDate: "2026-10-15T00:00:00.000+02:00", userId: "bob" };
    const created = await send("POST", "/api/v1/tasks", { user: "alice", body });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { task } = await created.json() as { task: Record<string, unknown> };
    expect(task).toMatchObject({ id: ID, title: "Plan", dueDate: "2026-10-14T22:00:00.000Z" });
    expect(task).not.toHaveProperty("userId");
    expect(rows.find(item => item.id === ID)?.userId).toBe("alice");
    const replay = await send("POST", "/api/v1/tasks", { user: "alice", body });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ task });
    expect(rows.filter(item => item.id === ID)).toHaveLength(1);
  });

  it("rejects another user's task ID without revealing or changing it", async () => {
    await send("POST", "/api/v1/tasks", { user: "bob", body: { id: ID, title: "Bob's" } });
    const response = await send("POST", "/api/v1/tasks", { user: "alice", body: { id: ID, title: "Hijack" } });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "TASK_CONFLICT", message: "This task could not be saved. Try again." });
    expect(rows.find(item => item.id === ID)).toMatchObject({ userId: "bob", title: "Bob's" });
  });

  it("validates the basic task body", async () => {
    for (const body of [{ id: ID, title: "" }, { title: "No operation ID" }, { id: "../x", title: "Plan" }, { id: ID, title: "Plan", dueDate: "tomorrow" }, "not json"]) {
      const response = await send("POST", "/api/v1/tasks", { user: "alice", body });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
    expect(rows).toHaveLength(2);
  });

  it("completes and deletes only owned tasks; foreign and missing IDs share one 404", async () => {
    const done = await send("POST", "/api/v1/tasks/alice-task/complete", { user: "alice", body: { occurrence: "2026-10-04T12:30:00.000Z" } });
    expect(done.status).toBe(200);
    expect(((await done.json()) as { task: { status: string } }).task.status).toBe("done");
    expect(completions).toEqual([new Date("2026-10-04T12:30:00.000Z")]);
    for (const [method, path] of [["POST", "/api/v1/tasks/bob-task/complete"], ["DELETE", "/api/v1/tasks/bob-task"], ["DELETE", "/api/v1/tasks/nope"]]) {
      const response = await send(method, path, { user: "alice" });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." });
    }
    expect(rows.find(item => item.id === "bob-task")).toMatchObject({ status: "todo" });
    const removed = await send("DELETE", "/api/v1/tasks/alice-task", { user: "alice" });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ id: "alice-task" });
    expect(rows.map(item => item.id)).toEqual(["bob-task"]);
  });

  it("requires a session, and a cookie session only from an allowed origin", async () => {
    const anonymous = await send("DELETE", "/api/v1/tasks/alice-task", { origin: ORIGIN });
    expect(anonymous.status).toBe(401);
    for (const origin of [undefined, "https://evil.example"]) {
      const response = await send("POST", "/api/v1/tasks/alice-task/complete", { cookie: "alice", origin });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
    }
    expect(rows.find(item => item.id === "alice-task")).toMatchObject({ status: "todo" });
    const browser = await send("POST", "/api/v1/tasks/alice-task/complete", { cookie: "alice", origin: ORIGIN });
    expect(browser.status).toBe(200);
  });
});
