import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { browserBulkTransport, bulkMutations, bulkTransport, completion, reorderAnchor, reorderTasks, type BulkTransport } from "./bulk";
import { SelectionToolbar, type BulkActions, type Selection } from "./bulk-views";
import { ProjectView } from "./project-views";
import { projectKeys } from "./projects";
import { taskKeys, type TaskDto, type TodayDto } from "./tasks";
import { TodayView } from "./views";
import { TaskCollectionView } from "./metadata-views";
import { SearchView } from "./search-views";

const native = vi.hoisted(() => ({ tauri: false, calls: [] as unknown[][], result: null as unknown }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => native.tauri,
  invoke: async (...args: unknown[]) => { native.calls.push(args); return native.result; },
}));

const VERSION = "2026-10-04T08:00:00.000Z";
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: VERSION, ...extra,
});
const TAP = "33333333-3333-4333-8333-333333333333";

describe("bulk transports", () => {
  it("browser: fixed paths, typed bodies, 404 as nothing written and 400 as invalid input", async () => {
    const calls: [string, BodyInit | null | undefined][] = [];
    const respond = (status: number, body: unknown = { ids: [] }) => (async (path: string, init?: RequestInit) => {
      calls.push([path, init?.body]);
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    expect(await browserBulkTransport(respond(200, { completed: ["a"], changed: [] })).complete([{ id: "a", occurrence: null }], TAP)).toEqual({ completed: ["a"], changed: [] });
    expect(await browserBulkTransport(respond(200)).remove(["a"])).toBe(true);
    expect(await browserBulkTransport(respond(404)).clearDates(["a"])).toBe(false);
    expect(await browserBulkTransport(respond(200)).metadata(["a"], { priority: 1 })).toBe(true);
    expect(await browserBulkTransport(respond(200)).move(["a"], { projectId: null, sectionId: null })).toBe(true);
    expect(await browserBulkTransport(respond(200, { id: "a/b" })).reorder("a/b", { anchorId: "c", position: "after" })).toBe(true);
    await expect(browserBulkTransport(respond(400)).metadata(["a"], { labelIds: ["gone"] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserBulkTransport(respond(500)).remove(["a"])).rejects.toMatchObject({ code: "SAVE_FAILED" });
    expect(calls.map(([path]) => path)).toEqual(["/api/v1/bulk/complete", "/api/v1/bulk/delete", "/api/v1/bulk/clear-date", "/api/v1/bulk/metadata", "/api/v1/bulk/move", "/api/v1/tasks/a%2Fb/reorder", "/api/v1/bulk/metadata", "/api/v1/bulk/delete"]);
    expect(calls.map(([, body]) => body).slice(0, 6)).toEqual([
      JSON.stringify({ operationId: TAP, tasks: [{ id: "a", occurrence: null }] }), JSON.stringify({ ids: ["a"] }), JSON.stringify({ ids: ["a"] }),
      JSON.stringify({ ids: ["a"], priority: 1 }), JSON.stringify({ ids: ["a"], projectId: null, sectionId: null }), JSON.stringify({ anchorId: "c", position: "after" }),
    ]);
  });

  it("native: one fixed command per operation", async () => {
    native.tauri = true; native.calls = []; native.result = { ids: ["a"] };
    const transport = bulkTransport();
    await transport.remove(["a"]); await transport.clearDates(["a"]); await transport.metadata(["a"], { deadline: null });
    await transport.move(["a"], { projectId: "work", sectionId: null }); await transport.reorder("a", { anchorId: "b", position: "before" });
    await transport.reorder("a", { status: "done" });
    native.result = null;
    expect(await transport.complete([{ id: "a", occurrence: null }], TAP)).toBeNull();
    expect(native.calls).toEqual([
      ["bulk_delete", { ids: ["a"] }], ["bulk_clear_date", { ids: ["a"] }], ["bulk_metadata", { ids: ["a"], change: { deadline: null } }],
      ["bulk_move", { ids: ["a"], projectId: "work", sectionId: null }], ["reorder_task", { id: "a", anchorId: "b", position: "before" }],
      ["reorder_task", { id: "a", status: "done" }],
      ["bulk_complete", { tasks: [{ id: "a", occurrence: null }], operationId: TAP }],
    ]);
    native.tauri = false;
  });
});

describe("reorder rules", () => {
  const tasks = [task("x"), task("p"), task("p1", { parentId: "p" }), task("p2", { parentId: "p" }), task("y")];
  it("drops next to a sibling, or next to the parent of a sub-task a root lands on", () => {
    expect(reorderAnchor(tasks, "y", "x")).toBe("x");
    expect(reorderAnchor(tasks, "p2", "p1")).toBe("p1");
    expect(reorderAnchor(tasks, "x", "p1")).toBe("p");
    expect(reorderAnchor(tasks, "p", "p1")).toBeNull();
    expect(reorderAnchor(tasks, "p1", "x")).toBeNull();
    expect(reorderAnchor(tasks, "x", "x")).toBeNull();
  });
  it("moves the row the way the server will", () => {
    expect(reorderTasks(tasks, "y", "x", "before").map(item => item.id)).toEqual(["y", "x", "p", "p1", "p2"]);
    expect(reorderTasks(tasks, "y", "gone", "before")).toBe(tasks);
  });
});

describe("bulk cache", () => {
  function setup(transport: Partial<BulkTransport>) {
    const cache = new QueryClient();
    const today: TodayDto = { tasks: [task("a", { dueDate: VERSION }), task("b"), task("c")], openCount: 1 };
    cache.setQueryData(taskKeys.today("alice"), today);
    cache.setQueryData(projectKeys.detail("alice", "work"), { project: { id: "work", name: "Work", color: null }, sections: [], tasks: today.tasks });
    cache.setQueryData(taskKeys.task("alice", "a"), task("a"));
    cache.setQueryData(["user", "alice", "metadata", "labels"], {});
    cache.setQueryData(taskKeys.today("bob"), { tasks: [], openCount: 0 });
    const full: BulkTransport = {
      complete: async () => ({ completed: [], changed: [] }), remove: async () => true, clearDates: async () => true,
      metadata: async () => true, move: async () => true, reorder: async () => true, ...transport,
    };
    const writes = bulkMutations(full, cache, "alice");
    const run = <T,>(options: object, input: T) => new MutationObserver(cache, options as never).mutate(input as never);
    const stale = () => cache.getQueryCache().getAll().filter(query => query.state.isInvalidated).map(query => query.queryKey.join("/")).sort();
    const ids = () => cache.getQueryData<TodayDto>(taskKeys.today("alice"))!.tasks.map(item => item.id);
    return { cache, writes, run, stale, ids, today };
  }

  it("applies deletes optimistically, refreshes every read of this user, and rolls back when nothing was written", async () => {
    let finish!: (done: boolean) => void;
    const { writes, run, stale, ids } = setup({ remove: () => new Promise(resolve => { finish = resolve; }) });
    const pending = run(writes.remove, { tasks: [task("a"), task("b")] });
    await vi.waitFor(() => expect(ids()).toEqual(["c"]));
    finish(false);
    await expect(pending).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(stale()).toEqual(["user/alice/metadata/labels", "user/alice/project/work", "user/alice/task/a", "user/alice/today"]);
  });

  it("treats a retried delete that finds the tasks gone as applied by the lost attempt", async () => {
    const answers = [new AccountTransportError("CONNECTION_FAILED"), false];
    const { writes, run, ids } = setup({ remove: async () => { const next = answers.shift(); if (next instanceof Error) throw next; return next as boolean; } });
    await expect(run({ ...writes.remove, retryDelay: 0 }, { tasks: [task("a")] })).resolves.toBe(true);
    expect(ids()).toEqual(["b", "c"]);
  });

  it("sends each task's due date with one tap ID and reorders the project list in place", async () => {
    const sent: unknown[] = [];
    const { cache, writes, run } = setup({
      complete: async (tasks, operationId) => { sent.push([tasks, operationId]); return { completed: ["a"], changed: ["b"] }; },
      reorder: async (...args) => { sent.push(args); return true; },
    });
    const selection = completion([task("a", { dueDate: VERSION }), task("b")]);
    await expect(run(writes.complete, selection)).resolves.toEqual({ completed: ["a"], changed: ["b"] });
    expect(sent[0]).toEqual([[{ id: "a", occurrence: VERSION }, { id: "b", occurrence: null }], selection.operationId]);
    await run(writes.reorder, { task: task("c"), anchorId: "a", position: "before" });
    expect(sent[1]).toEqual(["c", { anchorId: "a", position: "before" }]);
    // The settled refetch has no query function here, so the optimistic order stays visible.
    expect(cache.getQueryData<{ tasks: TaskDto[] }>(projectKeys.detail("alice", "work"))!.tasks.map(item => item.id)).toEqual(["c", "a", "b"]);
  });
});

describe("selection views", () => {
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
  const selection = (ids: string[]): Selection => ({ active: true, ids, has: (id) => ids.includes(id), toggle() {}, start() {}, stop() {}, drop() {} });
  const actions: BulkActions = {
    complete: async () => ({ completed: [], changed: [] }), remove: async () => {}, clearDates: async () => {}, metadata: async () => {}, move: async () => {},
    destinations: { status: "pending", error: null }, onRetryDestinations() {},
  };
  it("shows the legacy toolbar for a selection and a hint before anything is chosen", () => {
    const html = render(createElement(SelectionToolbar, { selection: selection(["a", "b"]), tasks: [task("a"), task("b")], actions }));
    expect(html).toContain('role="toolbar" aria-label="Selected task actions"');
    expect(html).toContain("2 selected");
    for (const label of ["Complete", "Delete", "Priority", "Labels", "Deadline", "Move", "Clear date", "Clear selection"]) expect(html).toContain(`>${label}</button>`);
    expect(render(createElement(SelectionToolbar, { selection: selection([]), tasks: [], actions }))).toContain("Select tasks to act on them together.");
  });

  it("renders row checkboxes in Today and grip handles in a project", () => {
    const slots = { control: createElement("button", null, "Select"), toolbar: null, row: (item: TaskDto) => ({ selected: item.id === "a", toggle() {} }) };
    const today = render(createElement(TodayView, { state: { status: "success", data: { tasks: [task("a", { dueDate: new Date().toISOString() })], openCount: 1 }, error: null }, onRetry() {}, selection: slots }));
    expect(today).toContain('aria-label="Select a" checked=""');
    expect(today).toContain("data-selected");
    const project = render(createElement(ProjectView, {
      state: { status: "success", data: { project: { id: "work", name: "Work", color: null }, sections: [], tasks: [task("a"), task("b")] }, error: null },
      onRetry() {}, onRename: async () => {}, onDelete() {}, write: { pending: false }, reorder() {},
    }));
    expect(project).toContain('aria-label="Reorder a"');
    expect(project).toContain('aria-roledescription="sortable"');
  });

  it("gives label, filter, Inbox and search lists the Select button, toolbar and row checkboxes; other layouts replace the list", () => {
    const slots = { control: createElement("button", null, "Select"), toolbar: createElement("div", { role: "toolbar" }, "2 selected"), row: (item: TaskDto) => ({ selected: item.id === "a", toggle() {} }) };
    const state = { status: "success" as const, data: { name: "Inbox", tasks: [task("a", { projectId: null }), task("b", { projectId: null })] }, error: null };
    for (const kind of ["label", "filter", "inbox"] as const) {
      const html = render(createElement(TaskCollectionView, { kind, state, onRetry() {}, selection: slots }));
      expect(html).toContain(">Select</button>");
      expect(html).toContain("2 selected");
      expect(html).toContain('aria-label="Select a" checked=""');
      expect(html.includes("Manage")).toBe(kind !== "inbox");
    }
    const board = render(createElement(TaskCollectionView, { kind: "label", state, onRetry() {}, selection: slots, layout: (tasks) => createElement("p", null, `board of ${tasks.length}`) }));
    expect(board).toContain("board of 2");
    expect(board).not.toContain(">Select</button>");
    const search = render(createElement(SearchView, { query: "a", state: { status: "success", data: { query: "a", tasks: [task("a")] }, error: null }, onSearch() {}, onRetry() {}, selection: slots }));
    expect(search).toContain(">Select</button>");
    expect(search).toContain('aria-label="Select a" checked=""');
  });

  it("lets project rows complete and delete, and shows completed tasks when Display does", () => {
    const state = { status: "success" as const, data: { project: { id: "work", name: "Work", color: null }, sections: [], tasks: [task("open"), task("done", { status: "done" })] }, error: null };
    const props = { state, onRetry() {}, onRename: async () => {}, onDelete() {}, write: { pending: false }, actions: { complete() {}, remove() {} } };
    const html = render(createElement(ProjectView, props));
    expect(html).toContain('aria-label="Complete open"');
    expect(html).toContain('aria-label="Delete open"');
    expect(html).not.toContain('aria-label="Complete done"');
    expect(render(createElement(ProjectView, { ...props, showCompleted: true }))).toContain('aria-label="Complete done"');
  });
});
