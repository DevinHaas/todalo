import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserProjectTransport, projectKeys, projectMutations, type ProjectTransport } from "./projects";
import { taskKeys, type TaskDto } from "./tasks";
import { ProjectsView, ProjectView } from "./project-views";
import { TodayView } from "./views";

const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: "work", parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], ...extra,
});
const work = { id: "work", name: "Work", color: null };
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const idle = { pending: false, error: null };
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });

describe("browser project transport", () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("sends fixed same-origin JSON writes with encoded IDs", async () => {
    calls.length = 0;
    expect(await browserProjectTransport(respond(201, { project: work })).create("Work")).toEqual(work);
    await browserProjectTransport(respond(200, { project: work })).rename("a/b", "Work");
    await browserProjectTransport(respond(200, { id: "a/b" })).remove("a/b");
    expect(calls.map(call => [call.init?.method, call.path, call.init?.credentials, call.init?.body])).toEqual([
      ["POST", "/api/v1/projects", "same-origin", JSON.stringify({ name: "Work" })],
      ["PATCH", "/api/v1/projects/a%2Fb", "same-origin", JSON.stringify({ name: "Work" })],
      ["DELETE", "/api/v1/projects/a%2Fb", "same-origin", undefined],
    ]);
  });

  it("maps not-found to null/false and failures to safe errors", async () => {
    expect(await browserProjectTransport(respond(404, { code: "NOT_FOUND" })).project("foreign")).toBeNull();
    expect(await browserProjectTransport(respond(404)).rename("foreign", "x")).toBeNull();
    expect(await browserProjectTransport(respond(404)).remove("foreign")).toBe(false);
    await expect(browserProjectTransport(respond(401)).projects()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(browserProjectTransport(respond(400)).create(" ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserProjectTransport(respond(403)).create("x")).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await expect(browserProjectTransport(respond(500)).projects()).rejects.toMatchObject({ code: "TASKS_UNAVAILABLE" });
    await expect(browserProjectTransport((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch).projects()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });
});

describe("project cache", () => {
  it("scopes keys to the signed-in user", () => {
    expect(projectKeys.list("alice")).toEqual(["user", "alice", "projects"]);
    expect(projectKeys.detail("alice", "p").slice(0, 2)).toEqual(taskKeys.user("alice"));
    expect(projectKeys.list("bob")).not.toEqual(projectKeys.list("alice"));
  });

  it("invalidates the list on create/rename and every task read on delete", async () => {
    const transport: ProjectTransport = {
      projects: async () => [], project: async () => null,
      create: async () => work, rename: async () => work, remove: async () => true,
    };
    const cache = new QueryClient();
    const seed = () => {
      for (const key of [projectKeys.list("alice"), projectKeys.detail("alice", "work"), taskKeys.today("alice"), taskKeys.task("alice", "t"), projectKeys.list("bob")]) cache.setQueryData(key, {});
    };
    const stale = () => cache.getQueryCache().getAll().filter(query => query.state.isInvalidated).map(query => query.queryKey.join("/")).sort();
    const writes = projectMutations(transport, cache, "alice");

    seed(); await writes.create("Work");
    expect(stale()).toEqual(["user/alice/projects"]);
    cache.clear(); seed(); await writes.rename("work", "Job");
    expect(stale()).toEqual(["user/alice/project/work", "user/alice/projects"]);
    cache.clear(); seed(); await writes.remove("work");
    expect(cache.getQueryData(projectKeys.detail("alice", "work"))).toBeUndefined();
    expect(stale()).toEqual(["user/alice/projects", "user/alice/task/t", "user/alice/today"]);
  });
});

describe("project screens", () => {
  it("renders directory loading, error, empty and populated states", () => {
    const view = (state: Parameters<typeof ProjectsView>[0]["state"]) => render(createElement(ProjectsView, { state, onRetry: noop, onCreate: async () => {}, write: idle }));
    expect(view({ status: "pending", error: null })).toContain("Loading projects…");
    expect(view({ status: "error", error: new Error("Your tasks could not be loaded. Try again.") })).toContain("Try again");
    expect(view(success([]))).toContain("Create a project to organize your tasks.");
    const populated = view(success([work, { id: "a/b", name: "Home", color: null }]));
    expect(populated).toContain('href="/projects/work"');
    expect(populated).toContain('href="/projects/a%2Fb"');
    expect(render(createElement(ProjectsView, { state: success([]), onRetry: noop, onCreate: async () => {}, write: { pending: false, error: "Check your entry and try again." } }))).toContain('role="alert"');
  });

  it("opens a project with its open member tasks, children after parents", () => {
    const tasks = [task("child", { parentId: "parent" }), task("parent"), task("done", { status: "done" })];
    const html = render(createElement(ProjectView, { state: success({ project: work, tasks }), onRetry: noop, onRename: async () => {}, onDelete: noop, write: idle }));
    expect(html).toContain("<h1 class=\"page-title\">Work</h1>");
    expect(html).toContain("2 tasks");
    expect(html.indexOf(">parent<")).toBeLessThan(html.indexOf(">child<"));
    expect(html).not.toContain(">done<");
    expect(html).toContain("</svg>Work</span>");
  });

  it("renders empty, not-found and error project states", () => {
    const view = (state: Parameters<typeof ProjectView>[0]["state"]) => render(createElement(ProjectView, { state, onRetry: noop, onRename: async () => {}, onDelete: noop, write: idle }));
    expect(view(success({ project: work, tasks: [] }))).toContain("No open tasks in this project.");
    expect(view(success(null))).toContain("Project not found");
    expect(view({ status: "error", error: new Error("Cannot reach todalo. Check your connection and try again.") })).toContain("Cannot reach todalo");
    expect(view({ status: "pending", error: null })).toContain("Loading project…");
  });

  it("labels Today rows with their project, falling back to Inbox", () => {
    const now = new Date(2026, 9, 4, 10);
    const due = new Date(2026, 9, 4, 9).toISOString();
    const html = render(createElement(TodayView, { now, onRetry: noop, projectNames: { work: "Work" }, state: success({ openCount: 2, tasks: [task("a", { dueDate: due }), task("b", { dueDate: due, projectId: null })] }) }));
    expect(html).toContain("</svg>Work</span>");
    expect(html).toContain("</svg>Inbox</span>");
  });
});
