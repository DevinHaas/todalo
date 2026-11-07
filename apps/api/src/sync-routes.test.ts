import { beforeEach, describe, expect, it } from "vitest";
import { buildDelta, MAX_DELTA, type SyncDelta, type SyncSource } from "@todalo/server/sync-delta";
import type { TaskDto } from "@todalo/server/task-dto";
import { createSyncRoutes } from "./sync-routes";

// An in-memory change log and entity store with the database source's semantics:
// a log row per changed entity carrying the transaction id that last wrote it.
interface Row { userId: string; entity: string; entityId: string; xid: number }
const state = { xmin: 100, log: [] as Row[], tasks: new Map<string, TaskDto & { userId: string }>(), projects: new Map<string, { id: string; name: string; color: null; userId: string }>() };
const task = (id: string, userId = "alice", title = id) => ({ id, userId, title, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null, dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "2026-11-07T12:00:00.000Z", commentCount: 0 } as TaskDto & { userId: string });
const write = (userId: string, entity: string, entityId: string) => {
  // Committed at once: the oldest still-running transaction (the xmin) moves past it.
  const xid = state.xmin++;
  state.log = [...state.log.filter(row => !(row.entity === entity && row.entityId === entityId)), { userId, entity, entityId, xid }];
};
const owned = <T extends { userId: string }>(rows: Map<string, T>, userId: string, ids: string[]) => ids.flatMap(id => { const row = rows.get(id); return row && row.userId === userId ? [row] : []; });
const source: SyncSource = {
  cursor: async () => state.xmin,
  changes: async (userId, since, limit) => state.log.filter(row => row.userId === userId && row.xid >= since).slice(0, limit),
  tasks: async (userId, ids) => owned(state.tasks, userId, ids).map(({ userId: _owner, ...dto }) => dto),
  projects: async (userId, ids) => owned(state.projects, userId, ids).map(({ id, name, color }) => ({ id, name, color })),
  labels: async () => [], filters: async () => [], comments: async () => [],
};

const app = createSyncRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? null,
  delta: (userId, since) => buildDelta(source, userId, since),
});
const get = async (since?: string, user: string | null = "alice") => {
  const response = await app.handle(new Request(`http://localhost/api/v1/sync${since === undefined ? "" : `?since=${since}`}`, { headers: user ? { authorization: `Bearer ${user}` } : {} }));
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() as SyncDelta };
};

beforeEach(() => {
  state.xmin = 100; state.log = []; state.tasks = new Map(); state.projects = new Map();
});

describe("GET /api/v1/sync", () => {
  it("needs a session and is never cached", async () => {
    expect((await get("1", null)).status).toBe(401);
    expect((await get()).cache).toBe("no-store");
  });

  it("without a cursor answers full with the current cursor and no rows", async () => {
    expect((await get()).body).toMatchObject({ full: true, cursor: "100", tasks: [], deleted: { task: [] } });
  });

  it("returns only what changed since the cursor, including deletions, and only the user's", async () => {
    state.tasks.set("old", task("old")); write("alice", "task", "old");
    const { cursor } = (await get()).body;
    state.tasks.set("new", task("new")); write("alice", "task", "new");
    state.tasks.set("bobs", task("bobs", "bob")); write("bob", "task", "bobs");
    state.projects.set("p", { id: "p", name: "Home", color: null, userId: "alice" }); write("alice", "project", "p");
    state.tasks.delete("old"); write("alice", "task", "old");
    write("alice", "goal", "g"); write("alice", "season", "s");

    const { body } = await get(cursor);
    expect(body.full).toBe(false);
    expect(body.tasks.map((row: TaskDto) => row.id)).toEqual(["new"]);
    expect(body.tasks[0]).not.toHaveProperty("userId");
    expect(body.deleted.task).toEqual(["old"]);
    expect(body.projects).toEqual([{ id: "p", name: "Home", color: null }]);
    expect(body.changed).toEqual(["goal", "season"]);
    expect(Number(body.cursor)).toBeGreaterThan(Number(cursor));
  });

  it("the next answer's cursor repeats nothing already seen; a change at the cursor itself is included", async () => {
    const first = (await get()).body.cursor;
    state.tasks.set("a", task("a")); write("alice", "task", "a");
    const second = (await get(first)).body;
    expect(second.tasks.map((row: TaskDto) => row.id)).toEqual(["a"]);
    // Nothing new: an empty delta at the same cursor.
    expect((await get(second.cursor)).body).toMatchObject({ full: false, tasks: [], deleted: { task: [] }, changed: [] });
    // A transaction holding the snapshot's xmin when the cursor was taken commits later: still delivered.
    state.log.push({ userId: "alice", entity: "task", entityId: "late", xid: Number(second.cursor) });
    state.tasks.set("late", task("late"));
    expect((await get(second.cursor)).body.tasks.map((row: TaskDto) => row.id)).toEqual(["late"]);
  });

  it.each([["malformed", "abc"], ["negative", "-1"], ["too long", "9".repeat(16)], ["ahead of the server (another database)", "500"]])("a %s cursor answers full", async (_name, since) => {
    expect((await get(since)).body).toMatchObject({ full: true, cursor: "100" });
  });

  it("more changes than one delta carries answers full (a long absence)", async () => {
    for (let index = 0; index <= MAX_DELTA; index++) write("alice", "task", `t${index}`);
    const delta = (await get("1")).body;
    expect(delta).toMatchObject({ full: true, tasks: [] });
    expect(delta.cursor).toBe(String(state.xmin));
    expect(Number(delta.cursor)).toBeGreaterThan(100);
  });
});
