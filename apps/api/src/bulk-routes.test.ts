// Ticket 15 routes: bulk actions and manual reorder. The ownership and
// atomicity rules run against the database boundary in packages/server/src/bulk.test.ts;
// this fake mirrors "every task must be the user's" so each route mapping is visible.
import { beforeEach, describe, expect, it } from "vitest";
import { MissingReferenceError } from "@todalo/server/metadata-input";
import { createBulkRoutes } from "./bulk-routes";

const ORIGIN = "http://localhost:5173";
const TAP = "33333333-3333-4333-8333-333333333333";
const owners: Record<string, string> = { a: "alice", b: "alice", other: "bob" };
let writes: string[] = [];
beforeEach(() => { writes = []; });

const owned = (userId: string, ids: string[]) => ids.every(id => owners[id] === userId);
const app = createBulkRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? (headers.get("cookie")?.replace("session=", "") || null),
  allowedOrigins: new Set([ORIGIN]),
  complete: async (userId, tasks, operationId) => {
    if (!owned(userId, tasks.map(task => task.id))) return null;
    writes.push(`complete:${operationId}:${tasks.map(task => `${task.id}@${task.occurrence?.toISOString() ?? "none"}`).join(",")}`);
    return { completed: tasks.filter(task => task.id !== "b").map(task => task.id), changed: tasks.some(task => task.id === "b") ? ["b"] : [] };
  },
  remove: async (userId, ids) => owned(userId, ids) && Boolean(writes.push(`delete:${ids}`)),
  clearDates: async (userId, ids) => owned(userId, ids) && Boolean(writes.push(`clear:${ids}`)),
  metadata: async (userId, ids, change) => {
    if (change.labelIds?.includes("bob-label")) throw new MissingReferenceError();
    return owned(userId, ids) && Boolean(writes.push(`metadata:${ids}:${JSON.stringify(change)}`));
  },
  move: async (userId, ids, destination) => owned(userId, ids) && destination.projectId !== "bob-project" && Boolean(writes.push(`move:${ids}:${destination.projectId}`)),
  reorder: async (userId, id, { anchorId, position, status }) => {
    if (!owned(userId, anchorId ? [id, anchorId] : [id])) return false;
    if (id === anchorId) return "invalid";
    writes.push(`reorder:${id}:${position ?? "end"}:${anchorId ?? "-"}:${status ?? "-"}`);
    return true;
  },
});
const post = (path: string, body: unknown, headers: Record<string, string> = { authorization: "Bearer alice" }) =>
  app.handle(new Request(`http://api.test/api/v1${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const json = async (response: Response) => ({ status: response.status, body: await response.json() });

describe("bulk routes", () => {
  it("authenticate writes: bearer alone, cookie only from an allowed origin", async () => {
    expect((await post("/bulk/delete", { ids: ["a"] }, { origin: ORIGIN })).status).toBe(401);
    expect(await json(await post("/bulk/delete", { ids: ["a"] }, { cookie: "session=alice" }))).toMatchObject({ status: 403, body: { code: "FORBIDDEN_ORIGIN" } });
    expect((await post("/bulk/delete", { ids: ["a"] }, { cookie: "session=alice", origin: ORIGIN })).status).toBe(200);
    expect((await post("/bulk/delete", { ids: ["a"] }, { cookie: "session=alice", origin: "https://evil.test" })).headers.get("cache-control")).toBe("no-store");
  });

  it("answer one 404 and write nothing when a selection includes another user's task", async () => {
    for (const [path, body] of [
      ["/bulk/complete", { operationId: TAP, tasks: [{ id: "a", occurrence: null }, { id: "other", occurrence: null }] }],
      ["/bulk/delete", { ids: ["a", "other"] }],
      ["/bulk/clear-date", { ids: ["other"] }],
      ["/bulk/metadata", { ids: ["a", "other"], priority: 1 }],
      ["/bulk/move", { ids: ["other"], projectId: null, sectionId: null }],
      ["/tasks/a/reorder", { anchorId: "other", position: "after" }],
      ["/tasks/other/reorder", { status: "done" }],
    ] as const) expect(await json(await post(path, body)), path).toEqual({ status: 404, body: { code: "NOT_FOUND", message: "This task does not exist or you do not have access to it." } });
    expect(writes).toEqual([]);
  });

  it("validate strict bodies and map deleted labels and bad reorders to 400", async () => {
    for (const [path, body] of [
      ["/bulk/complete", { operationId: "not-a-uuid", tasks: [{ id: "a", occurrence: null }] }],
      ["/bulk/complete", { operationId: TAP, tasks: [] }],
      ["/bulk/delete", { ids: [] }],
      ["/bulk/delete", { ids: Array.from({ length: 201 }, (_, index) => `t${index}`) }],
      ["/bulk/delete", { ids: ["a"], userId: "bob" }],
      ["/bulk/metadata", { ids: ["a"] }],
      ["/bulk/metadata", { ids: ["a"], priority: 5 }],
      ["/bulk/metadata", { ids: ["a"], labelIds: ["bob-label"] }],
      ["/bulk/metadata", { ids: ["a"], horizon: "someday" }],
      ["/bulk/move", { ids: ["a"], projectId: null, sectionId: "s" }],
      ["/tasks/a/reorder", { anchorId: "a", position: "after" }],
      ["/tasks/a/reorder", { anchorId: "b", position: "middle" }],
      ["/tasks/a/reorder", {}],
      ["/tasks/a/reorder", { anchorId: "b" }],
      ["/tasks/a/reorder", { position: "after", status: "done" }],
      ["/tasks/a/reorder", { status: "archived" }],
      ["/tasks/a/reorder", { status: "done", sortOrder: 0 }],
      ["/bulk/delete", "{"],
    ] as const) expect(await json(await post(path, body)), `${path} ${JSON.stringify(body)}`).toMatchObject({ status: 400, body: { code: "INVALID_INPUT" } });
    expect(writes).toEqual([]);
    expect((await post("/bulk/archive", { ids: ["a"] })).status).toBe(404);
  });

  it("pass typed values to the shared operations", async () => {
    expect(await json(await post("/bulk/complete", { operationId: TAP, tasks: [{ id: "a", occurrence: "2026-10-05T09:00:00.000Z" }, { id: "b", occurrence: null }] })))
      .toEqual({ status: 200, body: { completed: ["a"], changed: ["b"] } });
    expect(await json(await post("/bulk/metadata", { ids: ["a", "b"], deadline: null }))).toEqual({ status: 200, body: { ids: ["a", "b"] } });
    expect((await post("/bulk/metadata", { ids: ["a"], deadline: "2026-10-10T00:00:00.000Z" })).status).toBe(200);
    // Goals ticket 31: Now, Next, Later, or unsorted again.
    expect((await post("/bulk/metadata", { ids: ["a", "b"], horizon: "later" })).status).toBe(200);
    expect((await post("/bulk/metadata", { ids: ["a"], horizon: null })).status).toBe(200);
    expect((await post("/bulk/move", { ids: ["a"], projectId: "work", sectionId: null })).status).toBe(200);
    expect((await post("/bulk/move", { ids: ["a"], projectId: "bob-project", sectionId: null })).status).toBe(404);
    expect(await json(await post("/tasks/b/reorder", { anchorId: "a", position: "before" }))).toEqual({ status: 200, body: { id: "b" } });
    expect(await json(await post("/tasks/b/reorder", { status: "in_progress" }))).toEqual({ status: 200, body: { id: "b" } });
    expect((await post("/tasks/b/reorder", { anchorId: "a", position: "after", status: "done" })).status).toBe(200);
    expect(writes).toEqual([
      `complete:${TAP}:a@2026-10-05T09:00:00.000Z,b@none`,
      `metadata:a,b:{"deadline":null}`,
      `metadata:a:{"deadline":"2026-10-10T00:00:00.000Z"}`,
      `metadata:a,b:{"horizon":"later"}`,
      `metadata:a:{"horizon":null}`,
      "move:a:work",
      "reorder:b:before:a:-",
      "reorder:b:end:-:in_progress",
      "reorder:b:after:a:done",
    ]);
  });
});
