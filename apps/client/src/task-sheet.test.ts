import { afterEach, describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { browserCommentTransport, commentKeys, commentMutations, type CommentDto } from "./comments";
import { shortDateLabel, type TaskDto } from "./tasks";
import { linkify, TaskEditor } from "./task-sheet";
import { ancestorsOf, subtaskRows, TaskTree } from "./task-tree";
import { collapsedTasks, listTree, TaskRow } from "./views";
import { Composer } from "./composer";

const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: "2026-11-06T00:00:00.000Z", ...extra,
});
// Send bills > PF, BSS, EBP (done); PF > PF-a > PF-b.
const tree = [
  task("bills", { title: "Send bills", commentCount: 2 }), task("pf", { title: "PF", parentId: "bills" }), task("bss", { title: "BSS", parentId: "bills" }),
  task("ebp", { title: "EBP", parentId: "bills", status: "done" }), task("pf-a", { parentId: "pf" }), task("pf-b", { parentId: "pf-a" }), task("plain"),
];
const render = (node: ReactNode) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(TaskTree.Provider, { value: tree }, node)));
const row = (target: TaskDto, extra: object = {}) => render(createElement(TaskRow, { task: target, now: new Date(2026, 10, 6, 12), ...extra }));
afterEach(() => collapsedTasks.set(new Set()));

describe("list row indicators", () => {
  it("shows direct sub-task progress and the comment count only when there is something to show", () => {
    const html = row(tree[0]);
    expect(html).toContain('aria-label="Sub-tasks 1 of 3 done, show"');
    expect(html).toContain("</svg>1/3<svg");
    expect(html).toContain('aria-label="2 comments"');
    const plain = row(tree[6]);
    expect(plain).not.toContain("Sub-tasks");
    expect(plain).not.toContain("comment");
    expect(plain).toContain('class="pill project">Inbox');
  });

  it("counts each level's own children and indents by depth", () => {
    expect(row(tree[1])).toContain('aria-label="Sub-tasks 0 of 1 done, show"');
    const nested = row(tree[4], { depth: 2 });
    expect(nested).toContain('data-depth="2" style="--depth:2"');
  });

  it("collapses in-list sub-tasks with the chevron state, hiding every descendant", () => {
    const list = [tree[0], tree[1], tree[4], tree[5]];
    expect(listTree(list)(tree[0])).toEqual({ depth: 0, nested: true });
    expect(listTree(list)(tree[5])).toEqual({ depth: 3, nested: false });
    expect(row(tree[0], { nested: true })).toContain('aria-expanded="true"');
    collapsedTasks.set(new Set(["bills"]));
    expect(row(tree[0], { nested: true })).toContain('aria-expanded="false"');
    expect(row(tree[5], { depth: 3 })).toMatch(/data-task-id="pf-b"[^>]*hidden=""/);
  });

  it("labels dates like the reference: time ranges, Today implied on the Today page", () => {
    const now = new Date(2026, 10, 6, 12);
    const slot = { dueDate: new Date(2026, 10, 6, 19).toISOString(), dueDateEnd: new Date(2026, 10, 6, 19, 45).toISOString() };
    expect(shortDateLabel(slot, now, true)).toBe("19:00-19:45");
    expect(shortDateLabel(slot, now)).toBe("Today 19:00-19:45");
    expect(shortDateLabel({ dueDate: new Date(2026, 10, 6).toISOString(), dueDateEnd: null }, now, true)).toBe("");
    expect(shortDateLabel({ dueDate: new Date(2026, 10, 7).toISOString(), dueDateEnd: null }, now)).toBe("Tomorrow");
    expect(shortDateLabel({ dueDate: new Date(2026, 11, 19).toISOString(), dueDateEnd: null }, now)).toBe("19 Dec");
  });
});

describe("task sheet", () => {
  const sheet = (target: TaskDto, extra: object = {}) => render(createElement(TaskEditor, { task: target, onSave: async () => {}, onClose: () => {}, ...extra }));

  it("lists sub-tasks open first with their nested children, completed ones after Add sub-task", () => {
    expect(subtaskRows("bills", tree).map(({ task: item, depth }) => `${item.id}@${depth}`)).toEqual(["pf@0", "pf-a@1", "pf-b@2", "bss@0", "ebp@0"]);
    expect(subtaskRows("bills", tree, true).map(({ task: item }) => item.id)).not.toContain("ebp");
    const html = sheet(tree[0], { onAddSubtask: async () => {} });
    expect(html).toContain('aria-label="1 of 3 done"');
    expect(html).toContain(">Hide completed</button>");
    expect(html.indexOf(">BSS<")).toBeLessThan(html.indexOf("Add sub-task"));
    expect(html.indexOf("Add sub-task")).toBeLessThan(html.indexOf(">EBP<"));
    expect(html).toMatch(/class="sheet-subtask" data-done="true"[^>]*>.*EBP/);
  });

  it("shows the parent chain in the breadcrumb and offers no Add sub-task at the deepest level", () => {
    expect(ancestorsOf(tree[5], tree).map(item => item.id)).toEqual(["bills", "pf", "pf-a"]);
    const deepest = sheet(tree[5], { onAddSubtask: async () => {}, onOpen: () => {} });
    expect(deepest).toContain(">Send bills</button>");
    expect(deepest).not.toContain("Add sub-task");
    expect(sheet(tree[2], { onOpen: () => {} })).toContain('aria-label="Parent task: Send bills, 3 sub-tasks"');
    expect(sheet(tree[0])).not.toContain("Parent task");
    expect(sheet(tree[4], { onAddSubtask: async () => {} })).toContain("Add sub-task");
  });

  it("renders comments with author, time and clickable links, and the composer", () => {
    const comment: CommentDto = { id: "c1", taskId: "bills", body: "See https://mail.google.com/a and [docs](https://example.test/d)", createdAt: new Date(2026, 9, 22, 17, 17).toISOString(), author: { name: "Devin", image: null } };
    const html = sheet(tree[0], { comments: { state: { status: "success", data: [comment], error: null }, onRetry() {}, author: { name: "Devin", image: null }, add: async () => {}, remove() {} } });
    expect(html).toContain("Comments<span class=\"muted-count\">1</span>");
    expect(html).toContain("<strong>Devin</strong>");
    expect(html).toContain(">22 Oct 17:17</time>");
    expect(html).toContain('href="https://mail.google.com/a"');
    expect(html).toContain('href="https://example.test/d" target="_blank" rel="noreferrer noopener">docs</a>');
    expect(html).toContain('placeholder="Comment"');
    expect(sheet(tree[6])).not.toContain('aria-label="Comments"');
  });

  it("links plain and Markdown URLs only", () => {
    expect(linkify("no links")).toEqual(["no links"]);
    expect(linkify("a https://x.test/b c")).toHaveLength(3);
  });
});

describe("⌘E quick add editor", () => {
  it("starts from the task: title, its time slot, priority, and a Save button", () => {
    const slot = task("bath", { title: "Clean Bathroom", priority: 2, dueDate: new Date(2026, 10, 6, 19).toISOString(), dueDateEnd: new Date(2026, 10, 6, 19, 45).toISOString() });
    const html = render(createElement(Composer, { startOpen: true, quick: true, editing: slot, dueDate: () => slot.dueDate, onUpdate: async () => {} }));
    expect(html).toContain('value="Clean Bathroom"');
    expect(html).toContain("19:00-19:45");
    expect(html).toContain("Priority 2");
    expect(html).toContain('aria-label="Save task"');
    expect(html).not.toContain("Open Ramble");
  });
});

describe("comment transport and writes", () => {
  it("lists, adds and deletes through the comment routes, missing as null", async () => {
    const calls: string[] = [];
    const respond = (status: number, body?: unknown): typeof fetch => async (input, init) => {
      calls.push(`${init?.method} ${input} ${init?.body ?? ""}`);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    };
    const comment = { id: "c", taskId: "a/b", body: "hi", createdAt: "", author: { name: "A", image: null } };
    expect(await browserCommentTransport(respond(200, { comments: [comment] })).list("a/b")).toEqual([comment]);
    expect(await browserCommentTransport(respond(404)).list("gone")).toBeNull();
    expect(await browserCommentTransport(respond(201, { comment })).add("a/b", "op", "hi")).toEqual(comment);
    expect(await browserCommentTransport(respond(404)).remove("c")).toBe(false);
    expect(calls).toEqual(["GET /api/v1/tasks/a%2Fb/comments ", "GET /api/v1/tasks/gone/comments ", 'POST /api/v1/tasks/a%2Fb/comments {"id":"op","body":"hi"}', "DELETE /api/v1/comments/c "]);
  });

  it("appends an added comment and refreshes the lists' counts", async () => {
    const cache = new QueryClient();
    const comment = { id: "c", taskId: "t", body: "hi", createdAt: "", author: { name: "A", image: null } };
    cache.setQueryData(commentKeys.task("alice", "t"), []);
    cache.setQueryData(["user", "alice", "today"], { tasks: [], openCount: 0 });
    const writes = commentMutations({ list: async () => [], add: async () => comment, remove: async () => true }, cache, "alice");
    await cache.getMutationCache().build(cache, writes.add).execute({ taskId: "t", body: "hi", id: "c" });
    expect(cache.getQueryData(commentKeys.task("alice", "t"))).toEqual([comment]);
    expect(cache.getQueryState(["user", "alice", "today"])?.isInvalidated).toBe(true);
  });
});
