import { describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import { createTaskRoutes } from "./task-routes";

const row = (id: string, userId: string, extra: Partial<TaskRecord> = {}) => ({
  id, userId, title: `${userId} task`, description: null, status: "todo" as const, priority: 4,
  projectId: null, parentId: null, dueDate: new Date("2026-10-04T12:30:00.000Z"), dueDateEnd: null,
  deadline: null, completedAt: null, labelIds: ["label"], googleCalendarEventId: "private-event", sortOrder: 3, ...extra,
});
const rows = [row("alice-task", "alice"), row("bob-task", "bob")];
const seen: string[] = [];

const app = createTaskRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? null,
  today: async (userId) => { seen.push(userId); return { tasks: rows.filter(task => task.userId === userId), openCount: 1 }; },
  task: async (userId, id) => rows.find(task => task.userId === userId && task.id === id) ?? null,
});
const get = (path: string, user?: string) => app.handle(new Request(`http://localhost${path}`, user ? { headers: { authorization: `Bearer ${user}` } } : {}));

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
