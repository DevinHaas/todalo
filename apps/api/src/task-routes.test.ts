import { beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import { MissingReferenceError } from "@todalo/server/metadata-input";
import { TaskOrganizationError } from "@todalo/db/task-organization-validation";
import { createTaskRoutes, type TaskWrites } from "./task-routes";

type Row = TaskRecord & { userId: string };
const row = (id: string, userId: string, extra: Partial<TaskRecord> = {}): Row => ({
  id, userId, title: `${userId} task`, description: null, status: "todo" as const, priority: 4,
  projectId: null, parentId: null, dueDate: new Date("2026-10-04T12:30:00.000Z"), dueDateEnd: null,
  deadline: null, completedAt: null, labelIds: ["label"], googleCalendarEventId: "private-event", sortOrder: 3, ...extra,
} as Row);
let rows: Row[] = [];
const seen: string[] = [];
const completions: { occurrence?: Date | null; operationId?: string }[] = [];
const creates: Parameters<TaskWrites["create"]>[1][] = [];
const edits: unknown[] = [];
const VERSION = "2026-10-04T08:00:00.000Z";
beforeEach(() => { rows = [row("alice-task", "alice", { updatedAt: new Date(VERSION) }), row("bob-task", "bob")]; completions.length = 0; edits.length = 0; });

const owned = (userId: string, id: string) => rows.find(task => task.userId === userId && task.id === id) ?? null;
const ORIGIN = "http://localhost:5173";
const app = createTaskRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? (headers.get("cookie")?.replace("session=", "") || null),
  today: async (userId) => { seen.push(userId); return { tasks: rows.filter(task => task.userId === userId), openCount: 1 }; },
  task: async (userId, id) => owned(userId, id),
  allowedOrigins: new Set([ORIGIN]),
  // Operation-ID semantics of @todalo/server/tasks (covered against the database boundary there).
  create: async (userId, input) => {
    creates.push(input);
    if (input.projectId === "missing-project") throw new TaskOrganizationError("Project not found", "missing");
    const existing = rows.find(task => task.id === input.id);
    if (existing) return existing.userId === userId ? { task: existing, created: false } : null;
    const task = row(input.id, userId, { title: input.title, description: input.description ?? null, dueDate: input.dueDate ?? null, dueDateEnd: input.dueDateEnd ?? null, recurrence: input.recurrence ?? null, labelIds: [] });
    rows.push(task);
    return { task, created: true };
  },
  complete: async (userId, id, request) => {
    completions.push(request);
    const task = owned(userId, id);
    if (task && request.occurrence && request.occurrence.getTime() !== new Date(task.dueDate!).getTime()) return "changed";
    if (task) Object.assign(task, { status: "done", completedAt: new Date("2026-10-04T13:00:00.000Z") });
    return task;
  },
  // Stale-edit semantics of @todalo/server/tasks updateTask (covered there).
  update: async (userId, id, details) => {
    edits.push(details);
    if (details.labelIds?.includes("deleted")) throw new MissingReferenceError();
    const task = owned(userId, id);
    if (task && new Date(details.updatedAt).getTime() !== new Date(task.updatedAt!).getTime()) return "changed";
    if (task) Object.assign(task, { ...details, updatedAt: new Date("2026-10-04T09:00:00.000Z") });
    return task;
  },
  remove: async (userId, id) => { const task = owned(userId, id); rows = rows.filter(item => item !== task); return Boolean(task); },
  // Moves and parent changes: organization-routes.test.ts.
  organize: async () => null,
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
      id: "alice-task", title: "alice task", description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
      dueDate: "2026-10-04T12:30:00.000Z", dueDateEnd: null, deadline: null, completedAt: null, labelIds: ["label"],
      recurrence: null, updatedAt: VERSION, commentCount: 0,
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

  it("creates a quick-add task with its detected end time and repeat (ticket 12)", async () => {
    const body = { id: ID, title: "Standup", dueDate: "2026-10-15T09:00:00.000Z", dueDateEnd: "2026-10-15T09:30:00.000Z", recurrence: { n: 2, unit: "week", basedOn: "scheduled", until: "2026-12-31T00:00:00.000Z" } };
    const created = await send("POST", "/api/v1/tasks", { user: "alice", body });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { task: unknown }).task).toMatchObject({
      dueDate: "2026-10-15T09:00:00.000Z", dueDateEnd: "2026-10-15T09:30:00.000Z", recurrence: { n: 2, unit: "week", basedOn: "scheduled", until: "2026-12-31T00:00:00.000Z" },
    });
  });

  it("passes the composer's project, section, metadata and placement to the shared create", async () => {
    creates.length = 0;
    const body = { id: ID, title: "Draft", dueDate: null, projectId: "work", sectionId: "doing", priority: 2, deadline: "2026-10-20T00:00:00.000+02:00", labelIds: ["design"], placement: { edge: "below", anchorId: "alice-task" } };
    expect((await send("POST", "/api/v1/tasks", { user: "alice", body })).status).toBe(201);
    expect(creates[0]).toMatchObject({ projectId: "work", sectionId: "doing", priority: 2, deadline: "2026-10-20T00:00:00.000+02:00", labelIds: ["design"], placement: { edge: "below", anchorId: "alice-task" } });
    // A missing or foreign project, section or anchor is refused like any bad reference.
    const missing = await send("POST", "/api/v1/tasks", { user: "alice", body: { id: "8f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11", title: "Lost", projectId: "missing-project" } });
    expect(missing.status).toBe(400);
  });

  it("validates the basic task body", async () => {
    const repeat = { n: 1, unit: "day", basedOn: "scheduled", until: null };
    for (const body of [
      { id: ID, title: "" }, { title: "No operation ID" }, { id: "../x", title: "Plan" }, { id: ID, title: "Plan", dueDate: "tomorrow" }, "not json",
      { id: ID, title: "Plan", dueDate: null, dueDateEnd: "2026-10-15T09:30:00.000Z" }, { id: ID, title: "Plan", dueDateEnd: "2026-10-15T09:30:00.000Z" },
      { id: ID, title: "Plan", recurrence: { ...repeat, n: 0 } }, { id: ID, title: "Plan", recurrence: { ...repeat, unit: "fortnight" } },
      { id: ID, title: "Plan", recurrence: { ...repeat, userId: "bob" } }, { id: ID, title: "Plan", recurrence: { ...repeat, until: "soon" } },
      { id: ID, title: "Plan", priority: 5 }, { id: ID, title: "Plan", deadline: "friday" }, { id: ID, title: "Plan", labelIds: "design" },
      { id: ID, title: "Plan", placement: { edge: "middle" } }, { id: ID, title: "Plan", placement: { edge: "top", userId: "bob" } },
    ]) {
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
    expect(completions).toEqual([{ occurrence: new Date("2026-10-04T12:30:00.000Z"), operationId: undefined }]);
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

  const TAP = "0b6f2f8e-1c1a-4f4e-8a55-3a3d6e1c2b10";
  it("passes the completion operation ID through and answers a stale occurrence with 412", async () => {
    const stale = await send("POST", "/api/v1/tasks/alice-task/complete", { user: "alice", body: { occurrence: "2026-10-03T12:30:00.000Z", operationId: TAP } });
    expect(stale.status).toBe(412);
    expect(await stale.json()).toEqual({ code: "TASK_CHANGED", message: "This task changed on another device. Review it and try again." });
    expect(completions.at(-1)).toEqual({ occurrence: new Date("2026-10-03T12:30:00.000Z"), operationId: TAP });
    expect(rows.find(item => item.id === "alice-task")).toMatchObject({ status: "todo" });
    const bad = await send("POST", "/api/v1/tasks/alice-task/complete", { user: "alice", body: { occurrence: null, operationId: "not-a-uuid" } });
    expect(bad.status).toBe(400);
  });
});

describe("task edit API", () => {
  const details = {
    updatedAt: VERSION, title: "  Renamed  ", description: "Notes", priority: 2, deadline: "2026-10-20T00:00:00.000+02:00",
    dueDate: "2026-10-15T09:00:00.000+02:00", dueDateEnd: "2026-10-15T10:00:00.000+02:00",
    recurrence: { n: 2, unit: "week", basedOn: "completed", until: "2026-12-31T00:00:00.000Z" },
  };

  it("edits an owned task's details and schedule and returns the explicit DTO", async () => {
    const response = await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body: details });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(edits).toEqual([{ ...details, title: "Renamed" }]);
    const { task } = await response.json() as { task: Record<string, unknown> };
    expect(task).toMatchObject({ title: "Renamed", priority: 2, updatedAt: "2026-10-04T09:00:00.000Z", recurrence: { n: 2, unit: "week", basedOn: "completed", until: "2026-12-31T00:00:00.000Z" } });
    expect(task).not.toHaveProperty("userId");
    expect(task).not.toHaveProperty("googleCalendarEventId");
  });

  it("validates the edit body without reaching the task", async () => {
    for (const body of [
      { ...details, title: " " }, { ...details, priority: 5 }, { ...details, dueDate: "tomorrow" }, { ...details, updatedAt: undefined },
      { ...details, dueDate: null }, { ...details, recurrence: { n: 0, unit: "day", basedOn: "scheduled" } },
      { ...details, recurrence: { n: 1, unit: "fortnight", basedOn: "scheduled" } }, { ...details, userId: "bob" }, { ...details, projectId: "p" }, "not json",
    ]) {
      const response = await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body });
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
    expect(edits).toEqual([]);
  });

  it("answers a stale edit with 412, foreign and missing IDs with one 404, and guards cookie writes", async () => {
    const stale = await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body: { ...details, updatedAt: "2026-10-01T00:00:00.000Z" } });
    expect(stale.status).toBe(412);
    expect(await stale.json()).toMatchObject({ code: "TASK_CHANGED" });
    const foreign = await send("PATCH", "/api/v1/tasks/bob-task", { user: "alice", body: details });
    const missing = await send("PATCH", "/api/v1/tasks/nope", { user: "alice", body: details });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(rows.find(item => item.id === "bob-task")).toMatchObject({ title: "bob task" });
    expect((await send("PATCH", "/api/v1/tasks/alice-task", { body: details, origin: ORIGIN })).status).toBe(401);
    expect((await send("PATCH", "/api/v1/tasks/alice-task", { cookie: "alice", origin: "https://evil.example", body: details })).status).toBe(403);
    expect((await send("PATCH", "/api/v1/tasks/alice-task", { cookie: "alice", origin: ORIGIN, body: details })).status).toBe(200);
  });

  it("passes the dialog's label set through; a deleted or foreign label is invalid input (ticket 14)", async () => {
    const labeled = await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body: { ...details, labelIds: ["home"] } });
    expect(await labeled.json()).toMatchObject({ task: { labelIds: ["home"] } });
    const deleted = await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body: { ...details, updatedAt: "2026-10-04T09:00:00.000Z", labelIds: ["deleted"] } });
    expect(deleted.status).toBe(400);
    expect(await deleted.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    for (const labelIds of [[""], "home", Array.from({ length: 51 }, (_, index) => `l${index}`)]) {
      expect((await send("PATCH", "/api/v1/tasks/alice-task", { user: "alice", body: { ...details, labelIds } })).status).toBe(400);
    }
  });
});
