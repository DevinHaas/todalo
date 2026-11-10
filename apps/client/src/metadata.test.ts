import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserMetadataTransport, metadataKeys, metadataMutations, type MetadataTransport } from "./metadata";
import { FavoritesNav, listBuckets, MetadataDirectory, TaskCollectionView, type MetadataActions } from "./metadata-views";
import { taskKeys, taskMutations, type TaskDto, type TaskTransport } from "./tasks";
import { TaskEditor } from "./views";

// Cast: sectionId (ticket 13) may or may not be part of TaskDto yet.
const task = (id: string, extra: Partial<TaskDto> = {}) => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
}) as TaskDto;
const urgent = { id: "urgent", name: "Urgent", color: "#ff0000", favorite: false };
const definition = { labelId: "urgent", priority: null, status: "open" as const, due: "any" as const };
const filter = { id: "f/1", name: "Urgent open", query: null, definition, description: null, color: null, favorite: false };
const queryFilter = { id: "q", name: "Today's work", query: "today & #Work", definition: null, description: "Mine", color: "#4073ff", favorite: true };
const legacyFields = { name: filter.name, definition, description: null, color: null, favorite: false };
const queryFields = { name: "Today's work", query: "today & #Work", description: "Mine", color: "#4073ff", favorite: true };
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });
const actions: MetadataActions = { saveLabel: async () => {}, deleteLabel: async () => {}, saveFilter: async () => {}, deleteFilter: async () => {}, assistFilter: async () => ({ query: "today" }) };
const OPERATION = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";

describe("browser metadata transport", () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("sends fixed same-origin JSON requests with encoded IDs and the create operation ID", async () => {
    calls.length = 0;
    expect(await browserMetadataTransport(respond(201, { label: urgent })).createLabel(OPERATION, { name: "Urgent", color: "#ff0000", favorite: false })).toEqual(urgent);
    await browserMetadataTransport(respond(200, { label: urgent })).updateLabel("a/b", { name: "Urgent", color: null, favorite: true });
    await browserMetadataTransport(respond(200, { id: "a/b" })).removeLabel("a/b");
    await browserMetadataTransport(respond(201, { filter: queryFilter })).createFilter(OPERATION, queryFields);
    await browserMetadataTransport(respond(200, { filter })).updateFilter("f/1", legacyFields);
    await browserMetadataTransport(respond(200, { filter, tasks: [] })).filter("f/1");
    expect(await browserMetadataTransport(respond(200, { query: null, message: "Connect the Coach" })).assistFilter("work due today")).toEqual({ query: null, message: "Connect the Coach" });
    expect(calls.map(call => [call.init?.method, call.path, call.init?.body])).toEqual([
      ["POST", "/api/v1/labels", JSON.stringify({ id: OPERATION, name: "Urgent", color: "#ff0000", favorite: false })],
      ["PATCH", "/api/v1/labels/a%2Fb", JSON.stringify({ name: "Urgent", color: null, favorite: true })],
      ["DELETE", "/api/v1/labels/a%2Fb", undefined],
      ["POST", "/api/v1/filters", JSON.stringify({ id: OPERATION, ...queryFields })],
      ["PATCH", "/api/v1/filters/f%2F1", JSON.stringify(legacyFields)],
      ["GET", "/api/v1/filters/f%2F1", undefined],
      ["POST", "/api/v1/filters/assist", JSON.stringify({ description: "work due today" })],
    ]);
  });

  it("maps deleted and foreign IDs to null/false and failures to safe errors", async () => {
    expect(await browserMetadataTransport(respond(404)).label("deleted")).toBeNull();
    expect(await browserMetadataTransport(respond(404)).filter("foreign")).toBeNull();
    expect(await browserMetadataTransport(respond(404)).updateLabel("deleted", { name: "x", color: null, favorite: false })).toBeNull();
    expect(await browserMetadataTransport(respond(404)).removeFilter("deleted")).toBe(false);
    await expect(browserMetadataTransport(respond(401)).metadata()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(browserMetadataTransport(respond(400)).createFilter(OPERATION, { ...queryFields, query: "(" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserMetadataTransport(respond(409)).createLabel(OPERATION, { name: "x", color: null, favorite: false })).rejects.toMatchObject({ code: "SAVE_FAILED" });
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
    seed(cache); await writes.updateLabel("urgent", { name: "Now", color: null, favorite: false });
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
    await cache.getMutationCache().build(cache, update).execute({ id: "t", details });
    expect(stale(cache)).toEqual(expect.arrayContaining(["user/alice/metadata/filter/f", "user/alice/metadata/label/urgent", "user/alice/today"]));
    expect(stale(cache)).not.toContain("user/bob/metadata/list");
  });
});

describe("label and filter screens", () => {
  const preview = () => ({ groups: [] });
  const directory = (state: Parameters<typeof MetadataDirectory>[0]["state"], error: string | null = null) =>
    render(createElement(MetadataDirectory, { state, onRetry: noop, projects: [{ id: "work", name: "Work" }], actions, write: { pending: false, error }, preview }));

  it("renders Filters & Labels: My Filters and Labels with tinted icons, + buttons, hover tools and empty states", () => {
    const html = directory(success({ labels: [urgent], filters: [filter, queryFilter] }));
    expect(html).toContain("Filters &amp; Labels</h1>");
    expect(html).toContain('href="/labels/urgent"');
    expect(html).toContain('href="/filters/f%2F1"');
    expect(html).toContain("color:#ff0000");
    // A filter without a colour (every legacy row) is Charcoal.
    expect(html).toContain("color:#808080");
    for (const name of ["Add filter", "Add label", "Edit Urgent", "Delete Urgent", "Add Urgent to favorites", "Remove Today&#x27;s work from favorites"]) expect(html).toContain(`aria-label="${name}"`);
    const empty = directory(success({ labels: [], filters: [] }));
    expect(empty).toContain("Your list of filters will show up here.");
    expect(empty).toContain("Your list of labels will show up here.");
    expect(directory({ status: "pending", error: null })).toContain("Loading filters and labels…");
    expect(directory({ status: "error", error: new Error("Your tasks could not be loaded. Try again.") })).toContain("Try again");
    expect(directory(success({ labels: [], filters: [] }), "Check your entry and try again.")).toContain('role="alert"');
  });

  it("shows favorite filters and labels in the sidebar only when there are some", () => {
    expect(render(createElement(FavoritesNav, { metadata: { labels: [urgent], filters: [filter] } }))).toBe("");
    const html = render(createElement(FavoritesNav, { metadata: { labels: [{ ...urgent, favorite: true }], filters: [queryFilter] } }));
    expect(html).toContain("Favorites");
    expect(html.indexOf('href="/filters/q"')).toBeLessThan(html.indexOf('href="/labels/urgent"'));
  });

  it("renders a query filter's comma-separated lists under their own headings", () => {
    const html = render(createElement(TaskCollectionView, { kind: "filter", state: success({ name: "Two lists", description: "Mine", tasks: [task("a"), task("b")], groups: [{ title: "p1 & overdue", tasks: [task("a")] }, { title: "today", tasks: [] }] }), onRetry: noop }));
    expect(html).toContain(">p1 &amp; overdue</h2>");
    expect(html).toContain(">today</h2>");
    expect(html).toContain("No tasks.");
    expect(html).toContain("Mine");
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

  it("shows the sheet's Labels row (chips of known labels) only once the list is known", () => {
    const labeled = task("t", { labelIds: ["urgent"], updatedAt: "2026-10-15T08:00:00.000Z" });
    const html = render(createElement(TaskEditor, { task: labeled, labels: [urgent, { id: "home", name: "Home" }], onSave: async () => {}, onClose: noop }));
    expect(html).toContain('aria-label="Labels: Urgent"');
    expect(html).toContain('data-field="labels"');
    expect(html).not.toContain(">Home<");
    expect(render(createElement(TaskEditor, { task: labeled, labels: [], onSave: async () => {}, onClose: noop }))).toContain('aria-label="Add labels"');
    expect(render(createElement(TaskEditor, { task: labeled, onSave: async () => {}, onClose: noop }))).not.toContain('data-field="labels"');
  });
});
