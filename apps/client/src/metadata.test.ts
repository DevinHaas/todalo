import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserMetadataTransport, metadataKeys, metadataMutations, type MetadataTransport } from "./metadata";
import { listBuckets, MetadataDirectory, TaskCollectionView, type MetadataActions } from "./metadata-views";
import { taskKeys, taskMutations, type TaskDto, type TaskTransport } from "./tasks";
import { TaskEditor } from "./views";

// Cast: sectionId (ticket 13) may or may not be part of TaskDto yet.
const task = (id: string, extra: Partial<TaskDto> = {}) => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
}) as TaskDto;
const urgent = { id: "urgent", name: "Urgent", color: "#ff0000" };
const filter = { id: "f/1", name: "Urgent open", definition: { labelId: "urgent", priority: null, status: "open" as const, due: "any" as const } };
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });
const actions: MetadataActions = { saveLabel: async () => {}, deleteLabel: async () => {}, saveFilter: async () => {}, deleteFilter: async () => {} };
const OPERATION = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";

describe("browser metadata transport", () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("sends fixed same-origin JSON requests with encoded IDs and the create operation ID", async () => {
    calls.length = 0;
    expect(await browserMetadataTransport(respond(201, { label: urgent })).createLabel(OPERATION, { name: "Urgent", color: "#ff0000" })).toEqual(urgent);
    await browserMetadataTransport(respond(200, { label: urgent })).updateLabel("a/b", { name: "Urgent", color: null });
    await browserMetadataTransport(respond(200, { id: "a/b" })).removeLabel("a/b");
    await browserMetadataTransport(respond(201, { filter })).createFilter(OPERATION, { name: filter.name, definition: filter.definition });
    await browserMetadataTransport(respond(200, { filter })).updateFilter("f/1", { name: filter.name, definition: filter.definition });
    await browserMetadataTransport(respond(200, { filter, tasks: [] })).filter("f/1");
    expect(calls.map(call => [call.init?.method, call.path, call.init?.body])).toEqual([
      ["POST", "/api/v1/labels", JSON.stringify({ id: OPERATION, name: "Urgent", color: "#ff0000" })],
      ["PATCH", "/api/v1/labels/a%2Fb", JSON.stringify({ name: "Urgent", color: null })],
      ["DELETE", "/api/v1/labels/a%2Fb", undefined],
      ["POST", "/api/v1/filters", JSON.stringify({ id: OPERATION, name: filter.name, definition: filter.definition })],
      ["PATCH", "/api/v1/filters/f%2F1", JSON.stringify({ name: filter.name, definition: filter.definition })],
      ["GET", "/api/v1/filters/f%2F1", undefined],
    ]);
  });

  it("maps deleted and foreign IDs to null/false and failures to safe errors", async () => {
    expect(await browserMetadataTransport(respond(404)).label("deleted")).toBeNull();
    expect(await browserMetadataTransport(respond(404)).filter("foreign")).toBeNull();
    expect(await browserMetadataTransport(respond(404)).updateLabel("deleted", { name: "x", color: null })).toBeNull();
    expect(await browserMetadataTransport(respond(404)).removeFilter("deleted")).toBe(false);
    await expect(browserMetadataTransport(respond(401)).metadata()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(browserMetadataTransport(respond(400)).createFilter(OPERATION, { name: "x", definition: filter.definition })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserMetadataTransport(respond(409)).createLabel(OPERATION, { name: "x", color: null })).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await expect(browserMetadataTransport(respond(500)).metadata()).rejects.toMatchObject({ code: "TASKS_UNAVAILABLE" });
  });
});

describe("metadata cache", () => {
  const stale = (cache: QueryClient) => cache.getQueryCache().getAll().filter(query => query.state.isInvalidated).map(query => query.queryKey.join("/")).sort();
  const seed = (cache: QueryClient) => {
    for (const key of [metadataKeys.list("alice"), metadataKeys.label("alice", "urgent"), metadataKeys.filter("alice", "f"), taskKeys.today("alice"), taskKeys.task("alice", "t"), metadataKeys.list("bob")]) cache.setQueryData(key, {});
  };

  it("scopes keys to the user; label/filter writes refresh label and filter reads, deleting a label every task read", async () => {
    expect(metadataKeys.label("alice", "x").slice(0, 2)).toEqual(taskKeys.user("alice"));
    const transport = {
      createLabel: async () => urgent, updateLabel: async () => urgent, removeLabel: async () => true,
      createFilter: async () => filter, updateFilter: async () => filter, removeFilter: async () => true,
    } as unknown as MetadataTransport;
    const cache = new QueryClient();
    const writes = metadataMutations(transport, cache, "alice");
    const metadata = ["user/alice/metadata/filter/f", "user/alice/metadata/label/urgent", "user/alice/metadata/list"];
    seed(cache); await writes.updateLabel("urgent", { name: "Now", color: null });
    expect(stale(cache)).toEqual(metadata);
    cache.clear(); seed(cache); await writes.removeFilter("f");
    expect(cache.getQueryData(metadataKeys.filter("alice", "f"))).toBeUndefined();
    expect(stale(cache)).toEqual(metadata.slice(1));
    cache.clear(); seed(cache); await writes.removeLabel("urgent");
    expect(cache.getQueryData(metadataKeys.label("alice", "urgent"))).toBeUndefined();
    expect(stale(cache)).toEqual(["user/alice/metadata/filter/f", "user/alice/metadata/list", "user/alice/task/t", "user/alice/today"]);
  });

  it("task writes refresh label and filter task lists (affected lists and counts)", async () => {
    const cache = new QueryClient();
    const transport = { update: async () => task("t", { labelIds: ["urgent"] }) } as unknown as TaskTransport;
    seed(cache);
    const update = taskMutations(transport, cache, "alice").update;
    const details = { updatedAt: "2026-10-15T08:00:00.000Z", title: "t", description: "", priority: 4, deadline: null, dueDate: null, dueDateEnd: null, recurrence: null, labelIds: ["urgent"] };
    const result = await update.mutationFn({ id: "t", details });
    await update.onSettled(result, null, { id: "t" });
    expect(stale(cache)).toEqual(expect.arrayContaining(["user/alice/metadata/filter/f", "user/alice/metadata/label/urgent", "user/alice/today"]));
    expect(stale(cache)).not.toContain("user/bob/metadata/list");
  });
});

describe("label and filter screens", () => {
  const directory = (mode: "labels" | "filters", state: Parameters<typeof MetadataDirectory>[0]["state"], error: string | null = null) =>
    render(createElement(MetadataDirectory, { mode, state, onRetry: noop, projects: [{ id: "work", name: "Work", color: null }], actions, write: { pending: false, error } }));

  it("renders the legacy directory: labels everywhere, saved filters on /filters", () => {
    const data = { labels: [urgent], filters: [filter] };
    const labels = directory("labels", success(data));
    expect(labels).toContain("<h1 class=\"page-title\">Labels</h1>");
    expect(labels).toContain('href="/labels/urgent"');
    expect(labels).toContain("background-color:#ff0000");
    expect(labels).toContain("Create label");
    expect(labels).not.toContain("Saved filters");
    const filters = directory("filters", success(data));
    expect(filters).toContain("Filters &amp; Labels</h1>");
    expect(filters).toContain('href="/filters/f%2F1"');
    expect(filters).toContain("All chosen conditions must match.");
    for (const name of ["Filter priority", "Filter label", "Filter project", "Filter status", "Filter due date"]) expect(filters).toContain(`aria-label="${name}"`);
    expect(directory("labels", success({ labels: [], filters: [] }))).toContain("No labels yet.");
    expect(directory("labels", { status: "pending", error: null })).toContain("Loading labels…");
    expect(directory("labels", { status: "error", error: new Error("Your tasks could not be loaded. Try again.") })).toContain("Try again");
    expect(directory("filters", success(data), "Check your entry and try again.")).toContain('role="alert"');
  });

  it("lists matching tasks in the legacy buckets, completed included, with deleted/foreign states", () => {
    const now = new Date(2026, 9, 15, 10);
    const tasks = [task("later", { dueDate: new Date(2026, 9, 20).toISOString() }), task("today", { dueDate: new Date(2026, 9, 15, 9).toISOString(), status: "done" }), task("undated"), task("past", { dueDate: new Date(2026, 9, 1).toISOString() })];
    expect(listBuckets(tasks, now).map(bucket => [bucket.label, bucket.items.map(item => item.id)])).toEqual([["Today", ["today"]], ["Upcoming", ["later", "past"]], ["No date", ["undated"]]]);
    const html = render(createElement(TaskCollectionView, { kind: "filter", now, state: success({ name: "Urgent open", tasks }), onRetry: noop }));
    expect(html).toContain("<h1 class=\"page-title\">Urgent open</h1>");
    expect(html).toContain('href="/filters"');
    expect(html.indexOf(">Today<")).toBeLessThan(html.indexOf(">No date<"));
    const missing = render(createElement(TaskCollectionView, { kind: "label", state: success(null), onRetry: noop }));
    expect(missing).toContain("Label not found");
    expect(missing).toContain("This label does not exist or you do not have access to it.");
  });

  it("shows the editor's label checkboxes only once the list is known", () => {
    const labeled = task("t", { labelIds: ["urgent"], updatedAt: "2026-10-15T08:00:00.000Z" });
    const html = render(createElement(TaskEditor, { task: labeled, labels: [urgent, { id: "home", name: "Home" }], onSave: async () => {}, onClose: noop }));
    expect(html).toContain("<legend>Labels</legend>");
    expect(html).toMatch(/<input type="checkbox" checked=""\/>Urgent/);
    expect(html).toMatch(/<input type="checkbox"\/>Home/);
    expect(render(createElement(TaskEditor, { task: labeled, labels: [], onSave: async () => {}, onClose: noop }))).toContain('href="/labels"');
    expect(render(createElement(TaskEditor, { task: labeled, onSave: async () => {}, onClose: noop }))).not.toContain("<legend>Labels</legend>");
  });
});
