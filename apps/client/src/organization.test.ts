import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { browserOrganizationTransport, organizationKeys, organizationMutations, parentCandidates, type OrganizationTransport } from "./organization";
import { TaskOrganizer } from "./organization-views";
import { ProjectView } from "./project-views";
import { projectKeys } from "./projects";
import { taskKeys, type TaskDto } from "./tasks";

const VERSION = "2026-10-04T08:00:00.000Z";
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: VERSION, ...extra,
});
const work = { id: "work", name: "Work", color: null };
const doing = { id: "doing", projectId: "work", name: "Doing" };
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });
const noop = () => {};

describe("browser organization transport", () => {
  const calls: [string | undefined, string, BodyInit | null | undefined][] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push([init?.method, path, init?.body]);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("uses fixed paths with encoded IDs and sends the move with the version it started from", async () => {
    calls.length = 0;
    await browserOrganizationTransport(respond(200, { projects: [], sections: [] })).destinations();
    expect(await browserOrganizationTransport(respond(201, { section: doing })).createSection("a/b", "Doing")).toEqual(doing);
    expect(await browserOrganizationTransport(respond(200, { id: "a/b" })).removeSection("a/b")).toBe(true);
    await browserOrganizationTransport(respond(200, { task: task("t") })).organize("a/b", { updatedAt: VERSION, parentId: null });
    expect(calls).toEqual([
      ["GET", "/api/v1/destinations", undefined],
      ["POST", "/api/v1/projects/a%2Fb/sections", JSON.stringify({ name: "Doing" })],
      ["DELETE", "/api/v1/sections/a%2Fb", undefined],
      ["PATCH", "/api/v1/tasks/a%2Fb", JSON.stringify({ updatedAt: VERSION, parentId: null })],
    ]);
  });

  it("maps foreign IDs to null/false and refusals to safe errors", async () => {
    expect(await browserOrganizationTransport(respond(404)).createSection("foreign", "x")).toBeNull();
    expect(await browserOrganizationTransport(respond(404)).removeSection("foreign")).toBe(false);
    expect(await browserOrganizationTransport(respond(404)).organize("t", { updatedAt: VERSION, parentId: "foreign" })).toBeNull();
    await expect(browserOrganizationTransport(respond(400)).organize("t", { updatedAt: VERSION, parentId: "child" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserOrganizationTransport(respond(412)).organize("t", { updatedAt: VERSION, parentId: null })).rejects.toMatchObject({ code: "TASK_CHANGED" });
    await expect(browserOrganizationTransport(respond(401)).destinations()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("organization cache", () => {
  const sent: unknown[] = [];
  const transport: OrganizationTransport = {
    destinations: async () => ({ projects: [], sections: [] }),
    createSection: async (projectId, name) => projectId === "foreign" ? null : { id: "new", projectId, name },
    removeSection: async () => true,
    organize: async (id, change) => { sent.push(change); return id === "gone" ? null : task(id, { parentId: "p" }); },
  };
  const keys = [taskKeys.today("alice"), taskKeys.task("alice", "t"), taskKeys.task("alice", "child"), projectKeys.detail("alice", "work"), projectKeys.detail("alice", "home"), organizationKeys.destinations("alice"), projectKeys.list("alice"), taskKeys.today("bob")];
  function setup() {
    const cache = new QueryClient();
    for (const key of keys) cache.setQueryData(key, {});
    const stale = () => cache.getQueryCache().getAll().filter(query => query.state.isInvalidated).map(query => query.queryKey.join("/")).sort();
    const writes = organizationMutations(transport, cache, "alice");
    // Runs a mutation through TanStack's observer so onSuccess/onSettled fire as in the app.
    const run = <T,>(options: object, input: T) => new MutationObserver(cache, options as never).mutate(input as never);
    return { cache, stale, writes, run };
  }

  it("creating a section refreshes its project and the destinations only", async () => {
    const { stale, writes, run } = setup();
    await run(writes.createSection, { projectId: "work", name: "Review" });
    expect(stale()).toEqual(["user/alice/destinations", "user/alice/project/work"]);
    await expect(run(writes.createSection, { projectId: "foreign", name: "x" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("a move or section delete refreshes every task, project and Today read of this user, not other users", async () => {
    const { cache, stale, writes, run } = setup();
    sent.length = 0;
    await run(writes.organize, { task: task("t"), change: { parentId: "p" } });
    expect(sent).toEqual([{ parentId: "p", updatedAt: VERSION }]);
    expect(cache.getQueryData(taskKeys.task("alice", "t"))).toMatchObject({ parentId: "p" });
    expect(stale()).toEqual(["user/alice/project/home", "user/alice/project/work", "user/alice/task/child", "user/alice/task/t", "user/alice/today"]);
    cache.getQueryCache().getAll().forEach(query => query.reset());
    await run(writes.removeSection, doing);
    expect(stale()).toContain("user/alice/destinations");
    expect(stale()).not.toContain("user/bob/today");
    await expect(run(writes.organize, { task: task("gone"), change: { parentId: null } })).rejects.toBeInstanceOf(AccountTransportError);
  });

  it("offers open tasks of the same collection that keep the tree within three levels and acyclic", () => {
    const tasks = [task("t"), task("root"), task("done", { status: "done" }), task("sub", { parentId: "root" }), task("inbox", { projectId: null }),
      task("kid", { parentId: "parent" }), task("parent"), task("deep", { parentId: "sub" }), task("deepest", { parentId: "deep" })];
    // "deepest" is already at depth 3, so nothing can go under it.
    expect(parentCandidates(tasks[0], tasks).map(item => item.id)).toEqual(["root", "sub", "kid", "parent", "deep"]);
    // parent > kid is two levels: it fits under root (depth 0) or sub (depth 1), not under deep (2); never under its own kid.
    expect(parentCandidates(tasks[6], tasks).map(item => item.id)).toEqual(["t", "root", "sub"]);
  });
});

describe("organization views", () => {
  it("activates Add section and groups tasks: unsectioned first, then sections, sub-tasks after parents", () => {
    const tasks = [task("loose"), task("child", { sectionId: "doing", parentId: "parent" }), task("parent", { sectionId: "doing" }), task("lost", { sectionId: "deleted" })];
    const html = render(createElement(ProjectView, {
      state: success({ project: work, sections: [doing], tasks }), onRetry: noop, onRename: async () => {}, onDelete: noop, write: { pending: false },
      sections: { create: async () => {}, remove: noop },
    }));
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Add section<\/button>/);
    expect(html).toContain("Delete section");
    const order = ["loose", "lost", "Doing", "parent", "child"].map(text => html.indexOf(`>${text}<`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(render(createElement(ProjectView, { state: success({ project: work, sections: [], tasks: [] }), onRetry: noop, onRename: async () => {}, onDelete: noop, write: { pending: false } })))
      .toContain('<span class="button outline" aria-disabled="true">Add section</span>');
  });

  it("offers Move and Nest for every task and Unnest for a sub-task", () => {
    const view = (target: TaskDto) => render(createElement(TaskOrganizer, { task: target, tasks: [task("parent"), target], destinations: success({ projects: [work], sections: [doing] }), onRetryDestinations: noop, onOrganize: async () => {} }));
    expect(view(task("t"))).toContain(">Nest task<");
    const sub = view(task("t", { parentId: "parent" }));
    expect(sub).toContain("Sub-task of parent");
    expect(sub).toContain(">Unnest task<");
    expect(sub).toContain(">Nest task<");
    expect(sub).toContain(">Move task<");
  });
});
