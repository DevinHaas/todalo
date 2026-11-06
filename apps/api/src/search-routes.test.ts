import { describe, expect, it } from "vitest";
import type { TaskRecord } from "@todalo/server/task-dto";
import type { FindDto, SearchDto } from "@todalo/server/search";
import { createSearchRoutes } from "./search-routes";

const task = (id: string, userId: string, extra: Partial<TaskRecord> = {}): TaskRecord & { userId: string } => ({
  id, userId, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], ...extra,
});
const tasks = [
  task("alice-report", "alice", { title: "Write report" }),
  task("alice-call", "alice", { title: "Call", description: "About the REPORT" }),
  task("bob-report", "bob", { title: "Bob's secret report" }),
];
const projects = [{ id: "work", userId: "alice", name: "Reports" }, { id: "bob-work", userId: "bob", name: "Bob reports" }];
const sections = [{ id: "doing", userId: "alice", projectId: "work", name: "Report drafts" }, { id: "bob-doing", userId: "bob", projectId: "bob-work", name: "Bob report section" }];
const app = createSearchRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? null,
  tasks: async (userId) => tasks.filter(item => item.userId === userId),
  projects: async (userId) => projects.filter(item => item.userId === userId),
  sections: async (userId) => sections.filter(item => item.userId === userId),
});
const get = (path: string, user?: string) => app.handle(new Request(`http://api.test/api/v1${path}`, { headers: user ? { authorization: `Bearer ${user}` } : {} }));
const search = async (path: string, user: string) => await (await get(path, user)).json() as SearchDto;

describe("search routes", () => {
  it("require a session", async () => {
    for (const path of ["/search?q=report", "/find"]) {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("search only the session user's tasks with legacy title+description semantics", async () => {
    const response = await get("/search?q=REPORT", "alice");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as SearchDto;
    expect(body.query).toBe("REPORT");
    expect(body.tasks.map(item => item.id)).toEqual(["alice-report", "alice-call"]);
    // DTO allow-list: no owner column leaks.
    expect(body.tasks[0]).not.toHaveProperty("userId");
    expect((await search("/search?q=secret", "alice")).tasks).toEqual([]);
    expect((await search("/search?q=secret", "bob")).tasks.map(item => item.id)).toEqual(["bob-report"]);
  });

  it("treat a missing, repeated or overlong query like the legacy page", async () => {
    expect((await search("/search", "alice")).tasks).toHaveLength(2);
    const long = await search(`/search?q=${"x".repeat(300)}`, "alice");
    expect(long.query).toHaveLength(200);
    expect((await get("/search?q=call&q=x", "alice")).status).toBe(200);
  });

  it("list only the session user's Quick Find items", async () => {
    const { items } = await (await get("/find", "alice")).json() as FindDto;
    expect(items).toEqual([
      { id: "alice-report", title: "Write report", href: "/tasks/alice-report", kind: "Task" },
      { id: "alice-call", title: "Call", href: "/tasks/alice-call", kind: "Task" },
      { id: "work", title: "Reports", href: "/projects/work", kind: "Project" },
      { id: "doing", title: "Report drafts", href: "/projects/work#section-doing", kind: "Section" },
    ]);
  });
});
