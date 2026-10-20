import { describe, expect, it } from "vitest";
import { createApi } from "./app";
import { prepareTaskRows, RambleCommitError } from "./commit-rows";
import { fixtureSemanticProcessor } from "../test-fixtures/semantic";
import type { RambleTodo } from "@todalo/ramble";

const OP = "4f9c1a2e-8d3b-4c5a-9e7f-1a2b3c4d5e6f";
const todo = (fields: Partial<RambleTodo>): RambleTodo => ({
  id: "t1", title: "Buy milk", parentId: null, dueDate: "2026-10-16", startTime: "16:00", endTime: null, recurrence: null, projectId: null,
  description: null, priority: 4, deadline: null, labelIds: [], ...fields,
});

// The production commit's rules over a memory table: derived IDs, owned
// projects, insert-if-absent. Proves replays through the real route are no-ops.
function api() {
  const rows = new Map<string, ReturnType<typeof prepareTaskRows>[number]>();
  const owners = new Map([["work", "user-1"], ["foreign", "user-2"]]);
  const users: Record<string, string> = { "Bearer one": "user-1", "Bearer two": "user-2" };
  const app = createApi({
    allowedOrigins: new Set(["http://localhost:5173"]),
    verify: async (headers) => users[headers.get("authorization") ?? ""] ?? (headers.get("cookie") === "session=browser" ? "user-1" : null),
    preferences: async () => ({ smartRecognition: true, projectIds: new Set(), projects: [], labels: [] }),
    speech: () => { throw new Error("not used"); }, semantic: fixtureSemanticProcessor,
    commit: async (userId, todos, timeZone, operationId) => {
      const prepared = prepareTaskRows(todos, userId, timeZone, operationId);
      if (prepared.some((row) => row.projectId && owners.get(row.projectId) !== userId)) throw new RambleCommitError("missing");
      for (const row of prepared) if (!rows.has(row.id)) rows.set(row.id, row);
      return prepared.length;
    },
  });
  const post = (body: unknown, headers: Record<string, string> = { authorization: "Bearer one" }) =>
    app.handle(new Request("http://api.test/api/v1/ramble/commit", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { rows, post };
}

describe("POST /api/v1/ramble/commit", () => {
  it("saves a staged batch with sub-tasks once, however often it is replayed", async () => {
    const { rows, post } = api();
    const body = { operationId: OP, timeZone: "Europe/Zurich", todos: [todo({ projectId: "work" }), todo({ id: "t2", title: "Check fridge", parentId: "t1", dueDate: null, startTime: null })] };
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({ count: 2 });
    expect((await post(body)).status).toBe(200);
    expect(rows.size).toBe(2);
    const [parent, child] = [...rows.values()];
    expect(child.parentId).toBe(parent.id);
    expect(parent).toMatchObject({ userId: "user-1", projectId: "work", dueDate: new Date("2026-10-16T14:00:00.000Z") });
    // A new session (operation) is a new batch.
    await post({ ...body, operationId: "5f9c1a2e-8d3b-4c5a-9e7f-1a2b3c4d5e6f" });
    expect(rows.size).toBe(4);
  });

  it("saves spoken task details and refuses invalid ones", async () => {
    const { rows, post } = api();
    const details = { description: "  Bring the old one ", priority: 1, deadline: "2026-10-20", labelIds: ["errand"] };
    expect((await post({ operationId: OP, timeZone: "Europe/Zurich", todos: [todo(details)] })).status).toBe(200);
    expect([...rows.values()][0]).toMatchObject({ description: "Bring the old one", priority: 1, deadline: new Date("2026-10-19T22:00:00.000Z") });
    for (const bad of [{ priority: 0 }, { priority: 5 }, { deadline: "20 Oct" }, { labelIds: Array(21).fill("x") }]) {
      expect((await post({ operationId: OP, timeZone: "UTC", todos: [todo(bad)] })).status).toBe(400);
    }
    expect((await post({ operationId: OP, timeZone: "UTC", todos: [{ ...todo({}), labelIds: undefined }] })).status).toBe(400);
  });

  it("refuses foreign projects as 404, bad batches as 400 and writes nothing", async () => {
    const { rows, post } = api();
    expect((await post({ operationId: OP, timeZone: "UTC", todos: [todo({ projectId: "foreign" })] })).status).toBe(404);
    expect(await (await post({ operationId: OP, timeZone: "UTC", todos: [todo({ projectId: "foreign" })] })).json()).toMatchObject({ code: "NOT_FOUND" });
    expect((await post({ operationId: OP, timeZone: "UTC", todos: [todo({ parentId: "missing" })] })).status).toBe(400);
    expect((await post({ operationId: OP, timeZone: "UTC", todos: [todo({ title: "  " })] })).status).toBe(400);
    expect((await post({ operationId: OP, timeZone: "Europe/Zurich", todos: [todo({ dueDate: "2026-03-29", startTime: "02:30" })] })).status).toBe(400);
    expect((await post({ operationId: OP, timeZone: "UTC", todos: [{ ...todo({}), userId: "user-2" }] })).status).toBe(400);
    expect(rows.size).toBe(0);
  });

  it("keeps each user's replay separate and guards cookie writes by Origin", async () => {
    const { rows, post } = api();
    const body = { operationId: OP, timeZone: "UTC", todos: [todo({})] };
    expect((await post(body, { authorization: "Bearer revoked" })).status).toBe(401);
    expect((await post(body, { cookie: "session=browser" })).status).toBe(403);
    expect((await post(body, { cookie: "session=browser", origin: "https://evil.test" })).status).toBe(403);
    expect((await post(body, { cookie: "session=browser", origin: "http://localhost:5173" })).status).toBe(200);
    // Same operation and staged IDs from another account: its own rows, never user-1's.
    expect((await post(body, { authorization: "Bearer two" })).status).toBe(200);
    expect([...rows.values()].map((row) => row.userId).sort()).toEqual(["user-1", "user-2"]);
  });
});
