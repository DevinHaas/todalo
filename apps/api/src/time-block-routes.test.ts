import { beforeEach, describe, expect, it } from "vitest";
import { createTimeBlockRoutes } from "./time-block-routes";

type Row = { id: string; userId: string; goalId: string | null; title: string | null; startAt: Date; endAt: Date; taskIds: string[] };
const goals = [{ id: "alice-v2", userId: "alice" }, { id: "alice-fit", userId: "alice" }, { id: "bob-read", userId: "bob" }];
const tasks = [{ id: "alice-spec", userId: "alice" }, { id: "alice-tests", userId: "alice" }, { id: "bob-book", userId: "bob" }];
let rows: Row[] = [];
let next = 0;
beforeEach(() => {
  next = 0;
  rows = [{ id: "bob-block", userId: "bob", goalId: "bob-read", title: null, startAt: new Date("2026-02-20T09:00:00Z"), endAt: new Date("2026-02-20T10:00:00Z"), taskIds: ["bob-book"] }];
});

// In-memory mirror of packages/server/src/time-blocks.ts.
const goalAllowed = (userId: string, goalId: string | null | undefined) => !goalId || goals.some(goal => goal.userId === userId && goal.id === goalId);
const find = (userId: string, id: string) => rows.find(row => row.userId === userId && row.id === id) ?? null;
const app = createTimeBlockRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  list: async (userId) => rows.filter(row => row.userId === userId).sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
  create: async (userId, input) => {
    if (!goalAllowed(userId, input.goalId)) return null;
    const row = { id: `block-${++next}`, userId, goalId: input.goalId ?? null, title: input.title ?? null, startAt: input.start, endAt: input.end, taskIds: [] };
    rows.push(row);
    return row;
  },
  update: async (userId, id, patch) => {
    const row = find(userId, id);
    if (!row || !goalAllowed(userId, patch.goalId)) return null;
    if (patch.start && patch.end) Object.assign(row, { startAt: patch.start, endAt: patch.end });
    if (patch.goalId !== undefined) row.goalId = patch.goalId;
    if (patch.title !== undefined) row.title = patch.title;
    return row;
  },
  remove: async (userId, id) => {
    const before = rows.length;
    rows = rows.filter(row => !(row.userId === userId && row.id === id));
    return rows.length < before;
  },
  setTask: async (userId, blockId, taskId, linked) => {
    const row = find(userId, blockId);
    if (!row || !tasks.some(task => task.userId === userId && task.id === taskId)) return null;
    row.taskIds = linked ? [...new Set([...row.taskIds, taskId])] : row.taskIds.filter(id => id !== taskId);
    return row;
  },
});

const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const list = async (user = "alice") => ((await (await call("GET", "/time-blocks", { user })).json()) as { blocks: unknown[] }).blocks;
const create = (body: unknown, user = "alice") => call("POST", "/time-blocks", { user, body });
const range = { start: "2026-02-21T09:00:00.000Z", end: "2026-02-21T11:00:00.000Z" };

describe("time block API", () => {
  it("rejects every unauthenticated operation with the shared envelope", async () => {
    for (const [method, path, body] of [["GET", "/time-blocks"], ["POST", "/time-blocks", range], ["PATCH", "/time-blocks/bob-block", { title: "x" }], ["DELETE", "/time-blocks/bob-block"]] as const) {
      const response = await call(method, path, { origin: "http://localhost:5173", body });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("creates a block over a dragged range, without a goal or tasks", async () => {
    const response = await create(range);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ block: { id: "block-1", goalId: null, title: null, ...range, taskIds: [] } });
    const read = await call("GET", "/time-blocks", { user: "alice" });
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect((await read.json() as { blocks: unknown[] }).blocks).toEqual([{ id: "block-1", goalId: null, title: null, ...range, taskIds: [] }]);
  });

  it("dedicates a block to a goal with no tasks in it; an empty title clears", async () => {
    const created = await create({ ...range, goalId: "alice-v2", title: "  Deep work " });
    expect(await created.json()).toEqual({ block: { id: "block-1", goalId: "alice-v2", title: "Deep work", ...range, taskIds: [] } });
    const changed = await call("PATCH", "/time-blocks/block-1", { user: "alice", body: { goalId: "alice-fit", title: "" } });
    expect(await changed.json()).toEqual({ block: { id: "block-1", goalId: "alice-fit", title: null, ...range, taskIds: [] } });
    // Removing the goal keeps the reserved time.
    const cleared = await call("PATCH", "/time-blocks/block-1", { user: "alice", body: { goalId: null } });
    expect(await cleared.json()).toMatchObject({ block: { goalId: null, ...range } });
  });

  it("moves and resizes a block with start and end together", async () => {
    await create({ ...range, goalId: "alice-v2" });
    const moved = { start: "2026-02-22T14:00:00.000Z", end: "2026-02-22T16:00:00.000Z" };
    expect(await (await call("PATCH", "/time-blocks/block-1", { user: "alice", body: moved })).json()).toEqual({ block: { id: "block-1", goalId: "alice-v2", title: null, ...moved, taskIds: [] } });
    const resized = { start: moved.start, end: "2026-02-22T14:15:00.000Z" };
    expect(await (await call("PATCH", "/time-blocks/block-1", { user: "alice", body: resized })).json()).toMatchObject({ block: resized });
    // One side alone is refused rather than guessed.
    expect((await call("PATCH", "/time-blocks/block-1", { user: "alice", body: { end: "2026-02-22T18:00:00.000Z" } })).status).toBe(400);
  });

  it.each([
    ["end before start", { start: range.end, end: range.start }],
    ["shorter than 15 minutes", { start: range.start, end: "2026-02-21T09:10:00.000Z" }],
    ["longer than a day", { start: range.start, end: "2026-02-22T09:15:00.000Z" }],
    ["an instant without offset", { start: "2026-02-21T09:00:00", end: range.end }],
    ["unknown fields", { ...range, userId: "bob" }],
    ["a user ID smuggled as goal", { ...range, goalId: "" }],
  ])("refuses %s with 400", async (_name, body) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    expect(await list()).toEqual([]);
  });

  it("refuses malformed JSON and an empty patch with 400", async () => {
    const malformed = await app.handle(new Request("http://localhost/api/v1/time-blocks", { method: "POST", headers: { authorization: "Bearer alice", "content-type": "application/json" }, body: "{" }));
    expect(malformed.status).toBe(400);
    await create(range);
    expect((await call("PATCH", "/time-blocks/block-1", { user: "alice", body: {} })).status).toBe(400);
  });

  it("treats another user's block or goal exactly like a missing one", async () => {
    expect(await list()).toEqual([]);
    expect((await create({ ...range, goalId: "bob-read" })).status).toBe(404);
    expect((await create({ ...range, goalId: "nope" })).status).toBe(404);
    for (const [method, body] of [["PATCH", { title: "Mine now" }], ["DELETE", undefined]] as const) {
      const foreign = await call(method, "/time-blocks/bob-block", { user: "alice", body });
      const missing = await call(method, "/time-blocks/nope", { user: "alice", body });
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
    }
    await create(range);
    expect((await call("PATCH", "/time-blocks/block-1", { user: "alice", body: { goalId: "bob-read" } })).status).toBe(404);
    expect(rows.find(row => row.id === "bob-block")).toMatchObject({ userId: "bob", title: null });
  });

  it("puts several tasks into a block and takes them out again, idempotently", async () => {
    await create({ ...range, goalId: "alice-v2" });
    const put = (taskId: string) => call("PUT", `/time-blocks/block-1/tasks/${taskId}`, { user: "alice" });
    expect(await (await put("alice-spec")).json()).toEqual({ block: { id: "block-1", goalId: "alice-v2", title: null, ...range, taskIds: ["alice-spec"] } });
    await put("alice-tests");
    expect(await (await put("alice-spec")).json()).toMatchObject({ block: { taskIds: ["alice-spec", "alice-tests"] } });
    expect(await list()).toMatchObject([{ taskIds: ["alice-spec", "alice-tests"] }]);
    // Moving the block keeps its tasks.
    const moved = await call("PATCH", "/time-blocks/block-1", { user: "alice", body: { start: "2026-02-22T14:00:00.000Z", end: "2026-02-22T15:00:00.000Z" } });
    expect(await moved.json()).toMatchObject({ block: { taskIds: ["alice-spec", "alice-tests"] } });
    const out = () => call("DELETE", "/time-blocks/block-1/tasks/alice-spec", { user: "alice" });
    expect(await (await out()).json()).toMatchObject({ block: { taskIds: ["alice-tests"] } });
    expect((await out()).status).toBe(200);
  });

  it("refuses another user's block or task in a block like a missing one", async () => {
    await create(range);
    for (const [method, path] of [["PUT", "/time-blocks/block-1/tasks/bob-book"], ["PUT", "/time-blocks/bob-block/tasks/alice-spec"], ["DELETE", "/time-blocks/bob-block/tasks/bob-book"], ["PUT", "/time-blocks/block-1/tasks/nope"]] as const) {
      const response = await call(method, path, { user: "alice" });
      expect(response.status, `${method} ${path}`).toBe(404);
      expect((await response.json() as { code: string }).code).toBe("NOT_FOUND");
    }
    expect(rows.find(row => row.id === "bob-block")!.taskIds).toEqual(["bob-book"]);
    expect((await call("PUT", "/time-blocks/block-1/tasks/alice-spec", { origin: "http://localhost:5173" })).status).toBe(401);
    expect((await call("PUT", "/time-blocks/block-1/tasks/alice-spec", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
  });

  it("deletes a block; deleting again is a 404", async () => {
    await create(range);
    expect(await (await call("DELETE", "/time-blocks/block-1", { user: "alice" })).json()).toEqual({ id: "block-1" });
    expect(await list()).toEqual([]);
    expect((await call("DELETE", "/time-blocks/block-1", { user: "alice" })).status).toBe(404);
  });

  it("needs an allowed Origin for cookie writes; bearer writes need none", async () => {
    expect((await call("POST", "/time-blocks", { cookie: "alice", body: range })).status).toBe(403);
    expect((await call("POST", "/time-blocks", { cookie: "alice", origin: "https://evil.example", body: range })).status).toBe(403);
    expect((await call("POST", "/time-blocks", { cookie: "alice", origin: "http://localhost:5173", body: range })).status).toBe(201);
    expect((await create(range)).status).toBe(201);
  });
});
