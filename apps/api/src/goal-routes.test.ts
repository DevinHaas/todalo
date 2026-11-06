import { beforeEach, describe, expect, it } from "vitest";
import { planReorder } from "@todalo/server/bulk-input";
import { createGoalRoutes } from "./goal-routes";

type Row = { id: string; userId: string; title: string; description: string | null; sortOrder: number; archivedAt: Date | null };
let goals: Row[] = [];
let hidden: Map<string, boolean>;
beforeEach(() => {
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
      ["POST", "/goals/alice-fit/reorder", { anchorId: "alice-v2", position: "after" }], ["PUT", "/goals-visibility", { hidden: true }]] as const) {
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
    expect(await (await call("GET", "/goals/alice-fit", { user: "alice" })).json()).toEqual({ goal: { id: "alice-fit", title: "Become fit", description: "Run a marathon", archived: false } });
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
});
