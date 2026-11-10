import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserProjectTransport, displayChanges, filterProjectTasks, groupProjectTasks, projectKeys, projectMutations, sortProjectTasks, type ProjectTransport } from "./projects";
import { defaultProjectDisplay } from "../../../packages/server/src/project-dto";
import { taskKeys, type TaskDto } from "./tasks";
import { ProjectsView, ProjectView } from "./project-views";
import { TodayView } from "./views";

const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
});
const work = { id: "work", name: "Work", color: null, description: null, favorite: false, archived: false, display: defaultProjectDisplay };
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const idle = { pending: false, error: null };
const actions = { create: async () => {}, update: async () => {}, remove: async () => {} };
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });

describe("browser project transport", () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("sends fixed same-origin JSON writes with encoded IDs", async () => {
    calls.length = 0;
    expect(await browserProjectTransport(respond(201, { project: work })).create({ name: "Work" })).toEqual(work);
    await browserProjectTransport(respond(200, { project: work })).update("a/b", { name: "Work" });
    await browserProjectTransport(respond(200, { id: "a/b" })).remove("a/b");
    expect(calls.map(call => [call.init?.method, call.path, call.init?.credentials, call.init?.body])).toEqual([
      ["POST", "/api/v1/projects", "same-origin", JSON.stringify({ name: "Work" })],
      ["PATCH", "/api/v1/projects/a%2Fb", "same-origin", JSON.stringify({ name: "Work" })],
      ["DELETE", "/api/v1/projects/a%2Fb", "same-origin", undefined],
    ]);
  });

  it("maps not-found to null/false and failures to safe errors", async () => {
    expect(await browserProjectTransport(respond(404, { code: "NOT_FOUND" })).project("foreign")).toBeNull();
    expect(await browserProjectTransport(respond(404)).update("foreign", { name: "x" })).toBeNull();
    expect(await browserProjectTransport(respond(404)).remove("foreign")).toBe(false);
    await expect(browserProjectTransport(respond(401)).projects()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(browserProjectTransport(respond(400)).create({ name: " " })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserProjectTransport(respond(403)).create({ name: "x" })).rejects.toMatchObject({ code: "SAVE_FAILED" });
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
      create: async () => work, update: async () => work, remove: async () => true,
    };
    const cache = new QueryClient();
    const seed = () => {
      for (const key of [projectKeys.list("alice"), projectKeys.detail("alice", "work"), taskKeys.today("alice"), taskKeys.task("alice", "t"), projectKeys.list("bob")]) cache.setQueryData(key, {});
    };
    const stale = () => cache.getQueryCache().getAll().filter(query => query.state.isInvalidated).map(query => query.queryKey.join("/")).sort();
    const writes = projectMutations(transport, cache, "alice");

    seed(); await writes.create({ name: "Work" });
    expect(stale()).toEqual(["user/alice/projects"]);
    cache.clear(); seed(); await writes.rename("work", "Job");
    expect(stale()).toEqual(["user/alice/project/work", "user/alice/projects"]);
    cache.clear(); seed(); await writes.remove("work");
    expect(cache.getQueryData(projectKeys.detail("alice", "work"))).toBeUndefined();
    expect(stale()).toEqual(["user/alice/projects", "user/alice/task/t", "user/alice/today"]);
  });
});

describe("project sort (legacy ProjectView)", () => {
  const tasks = [
    task("b", { title: "banana", priority: 2, dueDate: "2026-10-22T00:00:00.000Z" }),
    task("a", { title: "Apple", priority: 4, dueDate: null }),
    task("c", { title: "cherry", priority: 2, dueDate: "2026-10-21T00:00:00.000Z" }),
    task("d", { title: "date", priority: 1, dueDate: null }),
  ];
  const ids = (sort: Parameters<typeof sortProjectTasks>[1]) => sortProjectTasks(tasks, sort).map(item => item.id);
  it("keeps the server's manual order", () => expect(ids("manual")).toEqual(["b", "a", "c", "d"]));
  it("sorts by name, case-insensitively by locale", () => expect(ids("name")).toEqual(["a", "b", "c", "d"]));
  it("sorts by priority, ties in manual order", () => expect(ids("priority")).toEqual(["d", "b", "c", "a"]));
  it("sorts by date, undated last in manual order", () => expect(ids("date")).toEqual(["c", "b", "a", "d"]));
  it("does not reorder its input", () => { sortProjectTasks(tasks, "name"); expect(tasks.map(item => item.id)).toEqual(["b", "a", "c", "d"]); });
});

describe("project Display (Todoist)", () => {
  const now = new Date(2026, 10, 9, 12);
  const at = (days: number) => new Date(2026, 10, 9 + days, 9).toISOString();
  const tasks = [
    task("today", { dueDate: at(0), priority: 1, labelIds: ["design"], createdAt: at(-1) }),
    task("late", { dueDate: at(-2), deadline: at(-1), createdAt: at(-40) }),
    task("soon", { dueDate: at(3), deadline: at(5), labelIds: ["design", "urgent"] }),
    task("undated", { createdAt: at(0) }),
    task("step", { parentId: "soon", priority: 1 }),
    task("done", { status: "done", dueDate: at(0) }),
  ];
  const ids = (change: Partial<typeof defaultProjectDisplay>) => filterProjectTasks(tasks, { ...defaultProjectDisplay, ...change }, now).map(item => item.id);
  it("counts the Sort and Filter choices that differ from the defaults, not the layout", () => {
    expect(displayChanges(defaultProjectDisplay)).toBe(0);
    expect(displayChanges({ ...defaultProjectDisplay, layout: "table", calendarRange: "week" })).toBe(0);
    expect(displayChanges({ ...defaultProjectDisplay, priority: "1", sorting: "name", showCompleted: true })).toBe(3);
  });
  it("filters by completion, date, deadline, created, priority and label", () => {
    expect(ids({})).toEqual(["today", "late", "soon", "undated", "step"]);
    expect(ids({ showCompleted: true })).toContain("done");
    expect(ids({ date: "today" })).toEqual(["today", "late"]);
    expect(ids({ date: "week" })).toEqual(["today", "late", "soon"]);
    expect(ids({ date: "overdue" })).toEqual(["late"]);
    expect(ids({ date: "none" })).toEqual(["undated", "step"]);
    expect(ids({ deadline: "any" })).toEqual(["late", "soon"]);
    expect(ids({ deadline: "overdue" })).toEqual(["late"]);
    expect(ids({ created: "week" })).toEqual(["today", "undated"]);
    expect(ids({ priority: "1" })).toEqual(["today", "step"]);
    expect(ids({ label: "design" })).toEqual(["today", "soon"]);
  });
  it("sorts by deadline and newest added first, undated last", () => {
    expect(sortProjectTasks(tasks, "deadline").map(item => item.id).slice(0, 2)).toEqual(["late", "soon"]);
    expect(sortProjectTasks(tasks, "added").map(item => item.id).slice(0, 3)).toEqual(["undated", "today", "late"]);
  });
  it("groups by priority, date and label; sub-tasks stay with their parent's group", () => {
    const open = tasks.filter(item => item.status !== "done");
    const groups = (grouping: Parameters<typeof groupProjectTasks>[1]) => groupProjectTasks(open, grouping, [{ id: "design", name: "Design" }, { id: "urgent", name: "Urgent" }], now)
      .map(group => `${group.title}: ${group.tasks.map(item => item.id).join(",")}`);
    expect(groups("priority")).toEqual(["Priority 1: today", "Priority 4: late,soon,undated,step"]);
    expect(groups("date")).toEqual(["Overdue: late", "Today: today", "Thu, Nov 12: soon,step", "No date: undated"]);
    expect(groups("label")).toEqual(["Design: today,soon,step", "Urgent: soon,step", "No label: late,undated"]);
  });
});

describe("project screens", () => {
  it("renders directory loading, error, empty and populated states", () => {
    const view = (state: Parameters<typeof ProjectsView>[0]["state"]) => render(createElement(ProjectsView, { state, onRetry: noop, actions, write: idle }));
    expect(view({ status: "pending", error: null })).toContain("Loading projects…");
    expect(view({ status: "error", error: new Error("Your tasks could not be loaded. Try again.") })).toContain("Try again");
    expect(view(success([]))).toContain("Create a project to organize your tasks.");
    const populated = view(success([{ ...work, completedCount: 1, openCount: 3 }, { ...work, id: "a/b", name: "Home", completedCount: 0, openCount: 0 }, { ...work, id: "old", name: "Old", archived: true, completedCount: 0, openCount: 0 }]));
    expect(populated).toContain('href="/projects/work"');
    expect(populated).toContain('href="/projects/a%2Fb"');
    // My Projects' columns: Completed, Open and Progress (25%); archived projects only under the switch.
    expect(populated).toContain("Work: 25% complete");
    expect(populated).not.toContain('href="/projects/old"');
    expect(populated).toContain("Archived projects only");
    // A failed create is toasted (toasts.ts), not repeated inline.
    expect(render(createElement(ProjectsView, { state: success([]), onRetry: noop, actions, write: { pending: false } }))).not.toContain('role="alert"');
  });

  it("opens a project with its open member tasks, children after parents", () => {
    const tasks = [task("child", { parentId: "parent" }), task("parent"), task("done", { status: "done" })];
    const html = render(createElement(ProjectView, { state: success({ project: work, sections: [], tasks }), onRetry: noop, write: idle }));
    expect(html).toContain(">Work</h1>");
    expect(html).toContain(">My Projects</a>");
    expect(html.indexOf(">parent<")).toBeLessThan(html.indexOf(">child<"));
    expect(html).not.toContain(">done<");
    expect(html).toContain("<span class=\"pill project\">Work<svg");
  });

  it("lists rows in Display's Sorting, sub-tasks under parents; Display counts its changes", () => {
    const tasks = [task("z", { title: "Zed" }), task("kid", { title: "Kid", parentId: "z" }), task("a", { title: "Ant" })];
    const view = (sorting: "manual" | "name") => render(createElement(ProjectView, { state: success({ project: work, sections: [], tasks }), onRetry: noop, write: idle, display: { ...defaultProjectDisplay, sorting } }));
    const manual = view("manual");
    expect(manual).toContain(">Display</button>");
    expect(manual.indexOf(">Zed<")).toBeLessThan(manual.indexOf(">Ant<"));
    const byName = view("name");
    expect(byName).toContain("Display: 1");
    expect(byName.indexOf(">Ant<")).toBeLessThan(byName.indexOf(">Zed<"));
    expect(byName.indexOf(">Zed<")).toBeLessThan(byName.indexOf(">Kid<"));
  });

  it("renders empty, not-found and error project states", () => {
    const view = (state: Parameters<typeof ProjectView>[0]["state"]) => render(createElement(ProjectView, { state, onRetry: noop, write: idle }));
    expect(view(success({ project: work, sections: [], tasks: [] }))).toContain("No open tasks in this project.");
    expect(view(success(null))).toContain("Project not found");
    expect(view({ status: "error", error: new Error("Cannot reach todalo. Check your connection and try again.") })).toContain("Cannot reach todalo");
    expect(view({ status: "pending", error: null })).toContain("Loading project…");
  });

  it("labels Today rows with their project, falling back to Inbox", () => {
    const now = new Date(2026, 9, 4, 10);
    const due = new Date(2026, 9, 4, 9).toISOString();
    const html = render(createElement(TodayView, { now, onRetry: noop, projectNames: { work: "Work" }, state: success({ openCount: 2, tasks: [task("a", { dueDate: due }), task("b", { dueDate: due, projectId: null })] }) }));
    expect(html).toContain("<span class=\"pill project\">Work<svg");
    expect(html).toContain("<span class=\"pill project\">Inbox<svg");
  });
});
