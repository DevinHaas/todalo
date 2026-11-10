import { beforeEach, describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import { createMetadataRoutes } from "./metadata-routes";
import { memoryMetadataStore, type MemoryFilter, type MemoryLabel } from "../test-fixtures/metadata-store";

const ORIGIN = "http://localhost:5173";
const OPERATION = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
let labels: MemoryLabel[] = [];
let filters: MemoryFilter[] = [];
let tasks: (TaskRecord & { userId: string })[] = [];
const task = (id: string, userId: string, extra: Partial<TaskRecord> = {}): TaskRecord & { userId: string } => ({
  id, userId, title: id, description: null, status: "todo", priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], ...extra,
});
let app: ReturnType<typeof createMetadataRoutes>;
beforeEach(() => {
  labels = [{ id: "urgent", userId: "alice", name: "Urgent", color: "#ff0000" }, { id: "bob-label", userId: "bob", name: "Private", color: null }];
  // Legacy-format rows: a bare definition (defaults omitted) and cleared selects.
  filters = [
    { id: "urgent-open", userId: "alice", name: "Urgent open", definition: { labelId: "urgent", priority: null } },
    { id: "done", userId: "alice", name: "Done", definition: { status: "done", due: "any" } },
    { id: "bob-filter", userId: "bob", name: "Bob", definition: { status: "any", due: "any" } },
  ];
  tasks = [
    task("labeled", "alice", { labelIds: ["urgent"] }),
    task("labeled-done", "alice", { labelIds: ["urgent"], status: "done" }),
    task("plain", "alice"),
    task("bob-labeled", "bob", { labelIds: ["urgent"] }),
    task("work", "alice", { projectId: "work" }),
  ];
  app = createMetadataRoutes(memoryMetadataStore({
    verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
    allowedOrigins: new Set([ORIGIN]),
    labels, filters, tasks,
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "bob-project", userId: "bob", name: "Work" }],
  }));
});
const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const ids = async (response: Response) => ((await response.json()) as { tasks: { id: string }[] }).tasks.map(item => item.id);

describe("label and saved filter API", () => {
  it("rejects every unauthenticated operation with the shared envelope", async () => {
    for (const [method, path] of [["GET", "/metadata"], ["GET", "/labels/urgent"], ["POST", "/labels"], ["PATCH", "/labels/urgent"], ["DELETE", "/labels/urgent"], ["GET", "/filters/done"], ["POST", "/filters"], ["PATCH", "/filters/done"], ["DELETE", "/filters/done"]]) {
      const response = await call(method, path, { origin: ORIGIN, body: method === "POST" || method === "PATCH" ? { name: "x" } : undefined });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("lists only the session user's labels and parsed legacy filters", async () => {
    const response = await call("GET", "/metadata?userId=bob", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      labels: [{ id: "urgent", name: "Urgent", color: "#ff0000", favorite: false }],
      filters: [
        { id: "done", name: "Done", definition: { status: "done", due: "any" }, query: null, description: null, color: null, favorite: false },
        { id: "urgent-open", name: "Urgent open", definition: { labelId: "urgent", priority: null, status: "open", due: "any" }, query: null, description: null, color: null, favorite: false },
      ],
    });
  });

  it("opens a label or filter with the owner's matching tasks; foreign and missing IDs share one 404", async () => {
    expect(await ids(await call("GET", "/labels/urgent", { user: "alice" }))).toEqual(["labeled", "labeled-done"]);
    expect(await ids(await call("GET", "/filters/urgent-open", { user: "alice" }))).toEqual(["labeled"]);
    expect(await ids(await call("GET", "/filters/done", { user: "alice" }))).toEqual(["labeled-done"]);
    for (const path of ["/labels/bob-label", "/labels/nope", "/filters/bob-filter", "/filters/nope"]) {
      const response = await call("GET", path, { user: "alice" });
      expect(response.status, path).toBe(404);
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("creates labels retry-safely and edits only the owner's", async () => {
    const body = { id: OPERATION, name: "  Home ", color: "#00ff00" };
    const created = await call("POST", "/labels", { user: "alice", body });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ label: { id: OPERATION, name: "Home", color: "#00ff00", favorite: false } });
    expect((await call("POST", "/labels", { user: "alice", body })).status).toBe(200);
    expect(labels.filter(item => item.id === OPERATION)).toHaveLength(1);
    expect((await call("POST", "/labels", { user: "bob", body })).status).toBe(409);
    expect(await (await call("PATCH", "/labels/urgent", { user: "alice", body: { name: "Now", color: "#123456" } })).json()).toEqual({ label: { id: "urgent", name: "Now", color: "#123456", favorite: false } });
    expect((await call("PATCH", "/labels/bob-label", { user: "alice", body: { name: "Mine" } })).status).toBe(404);
    expect((await call("DELETE", "/labels/bob-label", { user: "alice" })).status).toBe(404);
    for (const invalid of [{ id: OPERATION, name: " " }, { id: "not-a-uuid", name: "A" }, { id: OPERATION, name: "A", color: "red" }, { id: OPERATION, name: "A", userId: "bob" }]) {
      const response = await call("POST", "/labels", { user: "alice", body: invalid });
      expect(response.status, JSON.stringify(invalid)).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
  });

  it("deleting a label removes it from tasks, keeps filters that named it, and those filters then match nothing", async () => {
    expect(await (await call("DELETE", "/labels/urgent", { user: "alice" })).json()).toEqual({ id: "urgent" });
    expect(tasks.find(item => item.id === "labeled")?.labelIds).toEqual([]);
    expect(tasks.find(item => item.id === "bob-labeled")?.labelIds).toEqual(["urgent"]);
    expect(await ids(await call("GET", "/filters/urgent-open", { user: "alice" }))).toEqual([]);
    expect((await call("GET", "/labels/urgent", { user: "alice" })).status).toBe(404);
    // Saving that filter again with its deleted label is refused, as the legacy action did.
    const resave = await call("PATCH", "/filters/urgent-open", { user: "alice", body: { name: "Urgent open", definition: { labelId: "urgent", status: "open", due: "any" } } });
    expect(resave.status).toBe(400);
  });

  it("saves filters with owned references only, retry-safely, and deletes the owner's", async () => {
    const body = { id: OPERATION, name: "Work today", definition: { projectId: "work", due: "today" } };
    const created = await call("POST", "/filters", { user: "alice", body });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ filter: { id: OPERATION, name: "Work today", definition: { projectId: "work", status: "open", due: "today" }, query: null, description: null, color: null, favorite: false } });
    expect((await call("POST", "/filters", { user: "alice", body })).status).toBe(200);
    for (const definition of [{ labelId: "bob-label" }, { projectId: "bob-project" }, { sql: "drop table tasks" }, { status: "later" }]) {
      expect((await call("POST", "/filters", { user: "alice", body: { id: crypto.randomUUID(), name: "X", definition } })).status, JSON.stringify(definition)).toBe(400);
    }
    expect((await call("PATCH", "/filters/bob-filter", { user: "alice", body: { name: "Mine", definition: {} } })).status).toBe(404);
    expect(await (await call("PATCH", `/filters/${OPERATION}`, { user: "alice", body: { name: "Any", definition: { status: "any", due: "any" } } })).json()).toMatchObject({ filter: { name: "Any" } });
    expect((await call("DELETE", "/filters/bob-filter", { user: "alice" })).status).toBe(404);
    expect(await (await call("DELETE", `/filters/${OPERATION}`, { user: "alice" })).json()).toEqual({ id: OPERATION });
    expect(filters.map(item => item.id)).toEqual(["urgent-open", "done", "bob-filter"]);
  });

  it("saves query filters and opens them as their comma-separated lists of open tasks", async () => {
    const body = { id: OPERATION, name: "Urgent, then work", query: "@urgent, #Work & !@urgent", description: "Two lists", color: "#4073ff", favorite: true };
    const created = await call("POST", "/filters", { user: "alice", body });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ filter: { id: OPERATION, name: "Urgent, then work", query: "@urgent, #Work & !@urgent", definition: null, description: "Two lists", color: "#4073ff", favorite: true } });
    const detail = await (await call("GET", `/filters/${OPERATION}`, { user: "alice" })).json() as { tasks: { id: string }[]; groups: { title: string; tasks: { id: string }[] }[] };
    // Completed tasks are never listed; bob's task with a same-named label is not alice's.
    expect(detail.groups.map(group => [group.title, group.tasks.map(item => item.id)])).toEqual([["@urgent", ["labeled"]], ["#Work & !@urgent", ["work"]]]);
    expect(detail.tasks.map(item => item.id)).toEqual(["labeled", "work"]);
    for (const query of ["today &", "assigned to: me", "x".repeat(1025)]) {
      expect((await call("POST", "/filters", { user: "alice", body: { id: crypto.randomUUID(), name: "X", query } })).status, query).toBe(400);
    }
    expect((await call("POST", "/filters", { user: "alice", body: { id: crypto.randomUUID(), name: "X", query: "today", definition: { status: "open", due: "any" } } })).status).toBe(400);
    // Saving a query over a legacy filter replaces its definition.
    expect(await (await call("PATCH", "/filters/done", { user: "alice", body: { name: "Done", query: "p1" } })).json()).toMatchObject({ filter: { query: "p1", definition: null } });
  });

  it("Filter Assist asks the Coach's model and offers only queries the parser accepts", async () => {
    const asked: string[] = [];
    let reply = JSON.stringify({ query: "@urgent & today" });
    app = createMetadataRoutes(memoryMetadataStore({
      verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? null,
      allowedOrigins: new Set([ORIGIN]), labels, filters, tasks, projects: [{ id: "work", userId: "alice", name: "Work" }],
      coach: {
        provider: async (userId) => userId === "alice" ? { provider: "openai", model: "m", baseUrl: null, apiKey: "k" } : null,
        model: () => ({ complete: async ({ messages }) => { asked.push(messages.at(-1)!.content); return reply; } }),
      },
    }));
    const assist = async (user: string, description: unknown) => { const response = await call("POST", "/filters/assist", { user, body: { description } }); return [response.status, await response.json()]; };
    expect(await assist("alice", "urgent things due today")).toEqual([200, { query: "@urgent & today" }]);
    expect(asked[0]).toContain("Labels: @Urgent");
    expect(asked[0]).toContain("Projects: #Work");
    expect(asked[0]).toContain("urgent things due today");
    reply = JSON.stringify({ query: "assigned to: me" });
    expect(await assist("alice", "mine")).toEqual([200, { query: null, message: "The Coach suggested “assigned to: me”, which todalo can't use: Assignees aren't supported: todalo has no shared projects (“assigned to: me”)." }]);
    expect(await assist("bob", "anything")).toEqual([200, { query: null, message: "Connect the Coach in Settings › Coach to use Filter Assist." }]);
    expect((await assist("alice", " "))[0]).toBe(400);
    expect((await call("POST", "/filters/assist", { origin: ORIGIN, body: { description: "x" } })).status).toBe(401);
  });

  it("requires an allowed Origin for cookie-authenticated writes but not for bearer writes", async () => {
    const body = { id: OPERATION, name: "A" };
    expect((await call("POST", "/labels", { cookie: "alice", body })).status).toBe(403);
    expect((await call("DELETE", "/filters/done", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", "/labels", { cookie: "alice", origin: ORIGIN, body })).status).toBe(201);
    expect((await call("DELETE", "/labels/bob-label", { user: "bob", cookie: "alice" })).status).toBe(200);
  });
});
