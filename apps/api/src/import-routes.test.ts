import { beforeEach, describe, expect, it } from "vitest";
import type { ImportPlan, TodoistSnapshot } from "@todalo/server/todoist-import";
import { createImportRoutes, NATIVE_RETURN } from "./import-routes";
import type { TodoistClient } from "./todoist";

const ORIGIN = "http://localhost:5173";
const snapshot: TodoistSnapshot = {
  projects: [{ id: "inbox", name: "Inbox", inbox_project: true }, { id: "work", name: "Work" }],
  sections: [], labels: [], notes: [],
  items: [{ id: "t1", project_id: "work", content: "One" }, { id: "t2", project_id: "inbox", content: "Two", due: { date: "2026-11-10", is_recurring: true, string: "every day" } }],
};

let clock: number;
let applied: ImportPlan[];
let mapped: Map<string, string>;
let revoked: string[];
let exchangeFails: boolean;
let snapshotCalls: number;
const todoist: TodoistClient = {
  authorizeUrl: (state) => `https://app.todoist.com/oauth/authorize?state=${state}`,
  exchange: async (code) => { if (exchangeFails) throw new Error("no"); return `token-${code}`; },
  snapshot: async (token) => { snapshotCalls++; expect(token).toMatch(/^token-/); return snapshot; },
  completed: async () => [{ id: "done", project_id: "work", content: "Done", checked: true, completed_at: "2026-11-01T00:00:00Z" }],
  revoke: async (token) => { revoked.push(token); },
};
let applyFails: boolean;
const app = createImportRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set([ORIGIN]),
  todoist,
  context: async (_user, timeZone) => ({ mapped: new Map(mapped), existingLabels: [], timeZone }),
  apply: async (_user, plan) => {
    if (applyFails) throw new Error("db down");
    applied.push(plan);
    for (const m of plan.mappings) mapped.set(`${m.kind}:${m.externalId}`, m.localId);
  },
  promptDue: async (user) => !seen.has(user) && user !== "veteran",
  promptSeen: async (user) => { seen.add(user); },
  now: () => clock,
});
let seen = new Set<string>();

beforeEach(() => { clock = 1_000_000; applied = []; mapped = new Map(); revoked = []; exchangeFails = false; applyFails = false; snapshotCalls = 0; seen = new Set(); });

type Auth = { user?: string; cookie?: string; origin?: string };
const headersFor = (auth: Auth, json = false) => {
  const headers = new Headers();
  if (auth.user) headers.set("authorization", `Bearer ${auth.user}`);
  if (auth.cookie) headers.set("cookie", `session=${auth.cookie}`);
  if (auth.origin) headers.set("origin", auth.origin);
  if (json) headers.set("content-type", "application/json");
  return headers;
};
const req = (method: string, path: string, auth: Auth = {}, body?: unknown) =>
  app.handle(new Request(`http://localhost/api/v1/imports/todoist${path}`, { method, headers: headersFor(auth, body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) }));
const connect = async (auth: Auth = { user: "alice" }) => {
  const { authorizeUrl } = await (await req("POST", "/connect", auth)).json() as { authorizeUrl: string };
  return new URL(authorizeUrl).searchParams.get("state")!;
};
const callback = (query: Record<string, string>) => req("GET", `/callback?${new URLSearchParams(query)}`);
const selection = { projectIds: ["inbox", "work"], include: { sections: true, subtasks: true, labels: true, recurring: true, comments: true, completed: false }, timeZone: "Europe/Zurich" };

describe("Todoist import routes", () => {
  it("requires a session and guards cookie writes by origin", async () => {
    expect((await req("POST", "/connect", { origin: ORIGIN })).status).toBe(401);
    expect((await req("GET", "")).status).toBe(401);
    expect((await req("POST", "/connect", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await req("POST", "/run", { cookie: "alice" }, selection)).status).toBe(403);
  });

  it("connects natively, imports the selection once, and revokes the token", async () => {
    const state = await connect();
    expect(state).toHaveLength(72);
    expect(await (await req("GET", "", { user: "alice" })).json()).toEqual({ status: "pending", prompt: true });

    const page = await callback({ state, code: "abc" });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(NATIVE_RETURN);
    expect(html).not.toContain("token-abc");

    const status = await (await req("GET", "?timeZone=Europe/Zurich", { user: "alice" })).json();
    expect(status).toMatchObject({ status: "connected", preview: { projects: [{ id: "inbox", inbox: true, tasks: 1, imported: 0 }, { id: "work", name: "Work", tasks: 1 }], counts: { recurring: 1 } } });
    expect(JSON.stringify(status)).not.toContain("token-");

    const run = await req("POST", "/run", { user: "alice" }, selection);
    expect(run.status).toBe(200);
    expect(await run.json()).toEqual({ status: "done", result: { created: { projects: 1, sections: 0, tasks: 2, labels: 0 }, skipped: 0, warnings: [] } });
    expect(applied[0].tasks.find((t) => t.title === "Two")).toMatchObject({ projectId: null, recurrence: { unit: "day" } });
    expect(revoked).toEqual(["token-abc"]);
    expect(snapshotCalls).toBe(1);

    // The connection was used up; a second import needs a new connect and skips everything.
    expect((await req("POST", "/run", { user: "alice" }, selection)).status).toBe(409);
    await callback({ state: await connect(), code: "again" });
    const second = await (await req("POST", "/run", { user: "alice" }, selection)).json() as { result: unknown };
    expect(second.result).toMatchObject({ created: { tasks: 0, projects: 0 }, skipped: 2 });
  });

  it("returns browsers to their own origin's settings", async () => {
    const state = await connect({ cookie: "bob", origin: ORIGIN });
    expect(await (await callback({ state, code: "x" })).text()).toContain(`${ORIGIN}/account#import`);
  });

  it("rejects replayed, forged and expired states", async () => {
    const state = await connect();
    expect((await callback({ state, code: "a" })).status).toBe(200);
    expect((await callback({ state, code: "b" })).status).toBe(400);
    expect((await callback({ state: "forged", code: "a" })).status).toBe(400);

    const late = await connect({ user: "carol" });
    clock += 11 * 60_000;
    expect((await callback({ state: late, code: "a" })).status).toBe(400);
    expect(await (await req("GET", "", { user: "carol" })).json()).toEqual({ status: "idle", prompt: true });
  });

  it("records denial and exchange failures", async () => {
    await callback({ state: await connect(), error: "access_denied" });
    expect(await (await req("GET", "", { user: "alice" })).json()).toEqual({ status: "failed", error: "denied", prompt: true });
    exchangeFails = true;
    await callback({ state: await connect(), code: "x" });
    expect(await (await req("GET", "", { user: "alice" })).json()).toEqual({ status: "failed", error: "failed", prompt: true });
  });

  it("validates the selection and keeps the connection after a failed write", async () => {
    await callback({ state: await connect(), code: "abc" });
    expect((await req("POST", "/run", { user: "alice" }, { ...selection, projectIds: ["someone-elses"] })).status).toBe(400);
    expect((await req("POST", "/run", { user: "alice" }, { ...selection, timeZone: "Mars/Base" })).status).toBe(400);
    expect((await req("POST", "/run", { user: "alice" }, { ...selection, userId: "bob" })).status).toBe(400);
    applyFails = true;
    expect((await req("POST", "/run", { user: "alice" }, selection)).status).toBe(502);
    expect(revoked).toEqual([]);
    applyFails = false;
    const ok = await (await req("POST", "/run", { user: "alice" }, { ...selection, include: { ...selection.include, completed: true } })).json() as { result: { created: { tasks: number } } };
    expect(ok.result.created.tasks).toBe(3);
  });

  it("disconnect forgets the session and revokes its token", async () => {
    await callback({ state: await connect(), code: "abc" });
    expect(await (await req("DELETE", "", { user: "alice" })).json()).toEqual({ status: "idle" });
    expect(revoked).toEqual(["token-abc"]);
    expect(await (await req("GET", "", { user: "alice" })).json()).toEqual({ status: "idle", prompt: true });
  });

  it("answers the post-sign-up prompt once for the account", async () => {
    expect((await (await req("GET", "", { user: "veteran" })).json() as { prompt: boolean }).prompt).toBe(false);
    expect((await req("POST", "/prompt", { cookie: "dana", origin: "https://evil.example" })).status).toBe(403);
    expect(await (await req("POST", "/prompt", { user: "dana" })).json()).toEqual({ prompt: false });
    expect((await (await req("GET", "", { user: "dana" })).json() as { prompt: boolean }).prompt).toBe(false);
  });
});
