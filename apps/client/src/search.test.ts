import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserSearchTransport, searchKeys } from "./search";
import { QuickFindDialog, SearchView } from "./search-views";
import { copyTaskLink, copyText, followNativeLinks, openRoute, taskPath } from "./links";
import { taskMutations, type TaskDto, type TaskTransport } from "./tasks";
import { TaskEditor, TaskView } from "./views";
import { AccountTransportError } from "./errors";

const task = (id: string, extra: Partial<TaskDto> = {}) => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
}) as TaskDto;
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });
const noop = () => {};

describe("search transport", () => {
  it("sends the query only as an encoded q parameter and maps failures", async () => {
    const paths: string[] = [];
    let status = 200;
    const fetcher = (async (path: string) => { paths.push(path); return new Response(JSON.stringify({ query: "", tasks: [], items: [] }), { status }); }) as unknown as typeof fetch;
    const transport = browserSearchTransport(fetcher);
    await transport.search("a&b /c#d");
    await transport.find();
    expect(paths).toEqual(["/api/v1/search?q=a%26b+%2Fc%23d", "/api/v1/find"]);
    status = 401;
    await expect(transport.search("x")).rejects.toEqual(new AccountTransportError("UNAUTHENTICATED"));
    status = 500;
    await expect(transport.find()).rejects.toEqual(new AccountTransportError("TASKS_UNAVAILABLE"));
  });

  it("is invalidated by every task write", async () => {
    const cache = new QueryClient();
    cache.setQueryData(searchKeys.results("alice", "plan"), { query: "plan", tasks: [] });
    cache.setQueryData(searchKeys.find("alice"), { items: [] });
    const transport = { update: async () => task("a") } as unknown as TaskTransport;
    const update = taskMutations(transport, cache, "alice").update;
    await update.onSettled(undefined, null, { id: "a" });
    expect(cache.getQueryState(searchKeys.results("alice", "plan"))?.isInvalidated).toBe(true);
    expect(cache.getQueryState(searchKeys.find("alice"))?.isInvalidated).toBe(true);
  });
});

describe("search views", () => {
  const items = [
    { id: "t1", title: "Plan trip", href: "/tasks/t1", kind: "Task" as const },
    { id: "p1", title: "Plans", href: "/projects/p1", kind: "Project" as const },
  ];
  it("render the legacy Quick Find dialog with every item before typing", () => {
    const html = render(createElement(QuickFindDialog, { state: success({ items }), onRetry: noop, onOpen: noop, onClose: noop }));
    expect(html).toContain("Quick Find");
    expect(html).toContain('aria-label="Search tasks, projects and sections"');
    expect(html).toContain('href="/tasks/t1"');
    expect(html).toContain(">Project<");
    expect(html).toContain('href="/search?q="');
    expect(render(createElement(QuickFindDialog, { state: success({ items: [] }), onRetry: noop, onOpen: noop, onClose: noop }))).toContain("No results.");
  });
  it("render the legacy /search page with its count and rows", () => {
    const html = render(createElement(SearchView, { query: "plan", state: success({ query: "plan", tasks: [task("t1", { title: "Plan trip" })] }), onSearch: noop, onRetry: noop }));
    expect(html).toContain("<h1");
    expect(html).toContain('aria-label="Search tasks"');
    expect(html).toContain('value="plan"');
    expect(html).toContain("1 results");
    expect(html).toContain("Plan trip");
  });
  it("offer the sheet's More actions menu (Open task page, Copy link once the shareable URL is known) as a dropdown menu trigger", () => {
    const props = { task: task("a/b", { updatedAt: "2026-10-01T00:00:00.000Z" }), onSave: async () => {}, onClose: noop };
    expect(render(createElement(TaskEditor, { ...props, shareUrl: "https://todalo.example/tasks/a%2Fb" }))).toMatch(/aria-haspopup="menu"[^>]*aria-label="More actions"|aria-label="More actions"[^>]*aria-haspopup="menu"/);
  });
  it("show Previous and Next in the editor when it was opened from a list, disabled at its ends", () => {
    const props = { task: task("a", { updatedAt: "2026-10-01T00:00:00.000Z" }), onSave: async () => {}, onClose: noop };
    expect(render(createElement(TaskEditor, props))).not.toContain("data-navigate");
    const html = render(createElement(TaskEditor, { ...props, navigation: { previous: false, next: true, go: noop } }));
    expect(html).toMatch(/data-navigate="-1" aria-label="Previous task" title="Previous task" disabled=""/);
    expect(html).toMatch(/data-navigate="1" aria-label="Next task" title="Next task">/);
  });
  it("link the task page to its collection: the project, else the Inbox", () => {
    expect(render(createElement(TaskView, { state: success(task("a")), onRetry: noop }))).toMatch(/href="\/inbox"[^>]*>Open task collection/);
    expect(render(createElement(TaskView, { state: success(task("a", { projectId: "p 1" })), onRetry: noop }))).toMatch(/href="\/projects\/p%201"[^>]*>Open task collection/);
  });
});

describe("task links", () => {
  it("copies with the legacy messages", async () => {
    const written: string[] = [];
    await copyText("https://todalo.example/tasks/a", { writeText: async (text) => { written.push(text); } });
    expect(written).toEqual(["https://todalo.example/tasks/a"]);
    await expect(copyText("x", undefined)).rejects.toThrow("Clipboard access is unavailable. Open task details and copy the link manually.");
    await expect(copyText("x", { writeText: async () => { throw new Error("NotAllowed"); } })).rejects.toThrow("The browser blocked copying. Retry using Copy link or copy the task link manually.");
    expect(taskPath("a/b")).toBe("/tasks/a%2Fb");
  });

  it("copies a row's link from a key press with the page origin", async () => {
    vi.stubGlobal("window", { location: { origin: "https://todalo.example" } });
    const written: string[] = [];
    await copyTaskLink("a/b", { writeText: async (text) => { written.push(text); }, write: async () => {} }, false);
    expect(written).toEqual(["https://todalo.example/tasks/a%2Fb"]);
    vi.unstubAllGlobals();
  });

  function fakeWindow(pathname = "/today") {
    const pushed: string[] = [];
    const events: string[] = [];
    const target = {
      location: { pathname } as Location,
      history: { pushState: (_: unknown, __: string, url: string) => { pushed.push(url); target.location = { pathname: url } as Location; } } as unknown as History,
      dispatchEvent: (event: Event) => { events.push(event.type); return true; },
    };
    return { target, pushed, events };
  }

  it("opens only task routes and lets the router see them", () => {
    const { target, pushed, events } = fakeWindow();
    openRoute("/tasks/abc-123", target);
    openRoute("/tasks/abc-123", target); // already there: no duplicate entry
    for (const route of ["/account", "/tasks/a/complete", "/tasks/a?x=1", "//evil.example/tasks/a", "/tasks/..%2F", "https://evil.example/tasks/a"]) openRoute(route, target);
    expect(pushed).toEqual(["/tasks/abc-123"]);
    expect(events).toEqual(["popstate"]);
  });

  it("follows every link Rust hands over until the command fails", async () => {
    const routes = ["/tasks/a", "/tasks/b"];
    const opened: string[] = [];
    await followNativeLinks(async () => { const next = routes.shift(); if (!next) throw new Error("closed"); return next; }, (route) => opened.push(route));
    expect(opened).toEqual(["/tasks/a", "/tasks/b"]);
  });
});
