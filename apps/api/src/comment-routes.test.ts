import { beforeEach, describe, expect, it, vi } from "vitest";
import { addComment, deleteComment, listComments } from "@todalo/server/comments";
import { getOwnedTask } from "@todalo/server/today";
import { createCommentRoutes } from "./comment-routes";

// The real shared operations over the in-memory relational boundary.
const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

const ID = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
beforeEach(() => {
  boundary.rows = {
    user: [{ id: "alice", name: "Alice", image: null }, { id: "bob", name: "Bob", image: "https://example.test/bob.png" }],
    tasks: [{ id: "alice-task", userId: "alice", title: "Send bills" }, { id: "bob-task", userId: "bob", title: "Private" }],
    task_comments: [
      { id: "later", userId: "alice", taskId: "alice-task", body: "Second", createdAt: new Date("2026-10-22T15:18:00Z") },
      { id: "first", userId: "alice", taskId: "alice-task", body: "First", createdAt: new Date("2026-10-22T15:17:00Z") },
      { id: "bob-note", userId: "bob", taskId: "bob-task", body: "Secret", createdAt: new Date("2026-10-22T15:17:00Z") },
    ],
  };
});

const app = createCommentRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  list: listComments, add: addComment, remove: deleteComment,
});
const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = { user: "alice" }) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};

describe("task comment API", () => {
  it("lists the owner's comments oldest first with the author", async () => {
    const response = await call("GET", "/tasks/alice-task/comments");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { comments } = await response.json() as { comments: { id: string; createdAt: unknown }[] };
    // The boundary ignores ORDER BY; membership and shape are what is checked here.
    expect(comments.map((comment: { id: string }) => comment.id).sort()).toEqual(["first", "later"]);
    expect(comments[0]).toMatchObject({ taskId: "alice-task", author: { name: "Alice", image: null } });
    expect(typeof comments[0].createdAt).toBe("string");
  });

  it("treats foreign and missing tasks and comments alike, and refuses unsigned calls", async () => {
    expect((await call("GET", "/tasks/bob-task/comments")).status).toBe(404);
    expect((await call("GET", "/tasks/nope/comments")).status).toBe(404);
    expect((await call("POST", "/tasks/bob-task/comments", { user: "alice", body: { id: ID, body: "Hi" } })).status).toBe(404);
    expect((await call("DELETE", "/comments/bob-note")).status).toBe(404);
    expect((await call("GET", "/tasks/alice-task/comments", {})).status).toBe(401);
    expect(boundary.rows.task_comments).toHaveLength(3);
  });

  it("adds a trimmed comment once per operation ID and counts it on the task", async () => {
    const add = () => call("POST", "/tasks/alice-task/comments", { user: "alice", body: { id: ID, body: "  https://mail.google.com/x  " } });
    const first = await add();
    expect(first.status).toBe(201);
    expect((await first.json() as { comment: unknown }).comment).toMatchObject({ id: ID, body: "https://mail.google.com/x", author: { name: "Alice" } });
    expect((await add()).status).toBe(201);
    expect(boundary.rows.task_comments.filter(row => row.id === ID)).toHaveLength(1);
    // Another user cannot reuse the ID.
    boundary.rows.tasks.push({ id: "bob-2", userId: "bob", title: "x" });
    expect((await call("POST", "/tasks/bob-2/comments", { user: "bob", body: { id: ID, body: "mine" } })).status).toBe(409);
    boundary.rows.tasks.find(row => row.id === "alice-task")!.commentCount = 3;
    expect((await getOwnedTask("alice", "alice-task"))?.commentCount).toBe(3);
  });

  it("refuses empty bodies, unknown fields and cross-site cookie writes", async () => {
    expect((await call("POST", "/tasks/alice-task/comments", { user: "alice", body: { id: ID, body: "   " } })).status).toBe(400);
    expect((await call("POST", "/tasks/alice-task/comments", { user: "alice", body: { id: ID, body: "x", userId: "bob" } })).status).toBe(400);
    expect((await call("POST", "/tasks/alice-task/comments", { cookie: "alice", origin: "https://evil.test", body: { id: ID, body: "x" } })).status).toBe(403);
    expect((await call("POST", "/tasks/alice-task/comments", { cookie: "alice", origin: "http://localhost:5173", body: { id: ID, body: "x" } })).status).toBe(201);
  });

  it("deletes only the owner's comment", async () => {
    expect(await (await call("DELETE", "/comments/first")).json()).toEqual({ id: "first" });
    expect(boundary.rows.task_comments.map(row => row.id).sort()).toEqual(["bob-note", "later"]);
    expect((await call("DELETE", "/comments/first")).status).toBe(404);
  });
});
