// Ticket 17: legacy status board rules, its cache writes and its markup.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { boardDrop, bulkMutations, columnId, type BulkTransport } from "./bulk";
import { StatusBoard } from "./board-views";
import { ProjectView } from "./project-views";
import { projectKeys } from "./projects";
import { taskKeys, type TaskDto, type TodayDto } from "./tasks";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: async () => null }));

const VERSION = "2026-10-04T08:00:00.000Z";
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: "work", sectionId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: VERSION, ...extra,
});

describe("board drops", () => {
  const tasks = [
    task("a"), task("p"), task("p1", { parentId: "p" }), task("b"),
    task("home", { projectId: "home" }), task("doing", { status: "in_progress" }), task("done", { status: "done" }),
  ];
  it("moving to another column (the column or a card in it) sets that status and appends", () => {
    expect(boardDrop(tasks, "a", columnId("in_progress"))).toEqual({ status: "in_progress" });
    expect(boardDrop(tasks, "a", "done")).toEqual({ status: "done" });
    expect(boardDrop(tasks, "doing", columnId("todo"))).toEqual({ status: "todo" });
    // A sub-task moves alone, as legacy did.
    expect(boardDrop(tasks, "p1", columnId("done"))).toEqual({ status: "done" });
  });

  it("reorders within a column next to a card of the same collection, following the list rules", () => {
    expect(boardDrop(tasks, "a", "b")).toEqual({ anchorId: "b", position: "after" });
    expect(boardDrop(tasks, "b", "a")).toEqual({ anchorId: "a", position: "before" });
    // A root dropped on a sub-task lands next to its parent.
    expect(boardDrop(tasks, "b", "p1")).toEqual({ anchorId: "p", position: "before" });
    // Today and Upcoming boards mix projects: no cross-collection reorder.
    expect(boardDrop(tasks, "a", "home")).toBeNull();
  });

  it("writes nothing for its own column, itself, or an unknown target", () => {
    expect(boardDrop(tasks, "a", columnId("todo"))).toBeNull();
    expect(boardDrop(tasks, "a", "a")).toBeNull();
    expect(boardDrop(tasks, "a", "column:archived")).toBeNull();
    expect(boardDrop(tasks, "gone", columnId("done"))).toBeNull();
    expect(boardDrop(tasks, "p", "p1")).toBeNull();
  });
});

describe("board cache", () => {
  function setup(reorder: BulkTransport["reorder"]) {
    const cache = new QueryClient();
    const today: TodayDto = { tasks: [task("a"), task("b"), task("c")], openCount: 3 };
    cache.setQueryData(taskKeys.today("alice"), today);
    cache.setQueryData(projectKeys.detail("alice", "work"), { project: { id: "work", name: "Work", color: null }, sections: [], tasks: today.tasks });
    const transport: BulkTransport = {
      complete: async () => ({ completed: [], changed: [] }), remove: async () => true, clearDates: async () => true, metadata: async () => true, move: async () => true, reorder,
    };
    const writes = bulkMutations(transport, cache, "alice");
    const run = (input: object) => new MutationObserver(cache, { ...writes.reorder, retryDelay: 0 } as never).mutate(input as never);
    const view = (key: readonly unknown[]) => cache.getQueryData<{ tasks: TaskDto[] }>(key)!.tasks.map(item => `${item.id}:${item.status}`);
    return { run, view };
  }

  it("moves the card into its column at the end of Today and the project, then keeps it", async () => {
    const sent: unknown[] = [];
    const { run, view } = setup(async (...args) => { sent.push(args); return true; });
    await run({ task: task("a"), status: "in_progress" });
    expect(sent).toEqual([["a", { status: "in_progress" }]]);
    expect(view(taskKeys.today("alice"))).toEqual(["b:todo", "c:todo", "a:in_progress"]);
    expect(view(projectKeys.detail("alice", "work"))).toEqual(["b:todo", "c:todo", "a:in_progress"]);
  });

  it("rolls the card back when the write fails or finds the task gone", async () => {
    let finish!: (done: boolean) => void;
    const { run, view } = setup(() => new Promise(resolve => { finish = resolve; }));
    const pending = run({ task: task("b"), status: "done" });
    await vi.waitFor(() => expect(view(taskKeys.today("alice"))).toEqual(["a:todo", "c:todo", "b:done"]));
    finish(false);
    await expect(pending).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(view(taskKeys.today("alice"))).toEqual(["a:todo", "b:todo", "c:todo"]);
    expect(view(projectKeys.detail("alice", "work"))).toEqual(["a:todo", "b:todo", "c:todo"]);
  });
});

describe("board view", () => {
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
  const tasks = [task("Write"), task("Step", { parentId: "Write" }), task("Ship", { status: "in_progress" }), task("Plan", { status: "done" })];

  it("renders the legacy columns with cards in tree order and keyboard drag handles", () => {
    const html = render(createElement(StatusBoard, { tasks, onOpen() {}, onMove() {} }));
    expect([...html.matchAll(/<h2 class="board-column-title">([^<]+)</g)].map(match => match[1])).toEqual(["To do", "In progress", "Done"]);
    expect(html).toContain('data-task-column="in_progress"');
    expect(html.indexOf(">Write</button>")).toBeLessThan(html.indexOf(">Step</button>"));
    expect(html).toContain('class="board-card sub-task" data-task-id="Step"');
    expect(html).toContain('aria-label="Reorder Ship"');
    expect(html).toContain('aria-roledescription="sortable"');
    // Read-only without a write: no handles.
    expect(render(createElement(StatusBoard, { tasks, onOpen() {} }))).not.toContain("drag-handle");
  });

  it("replaces a project's section list when Display chooses another layout", () => {
    const state = { status: "success" as const, data: { project: { id: "work", name: "Work", color: null }, sections: [], tasks }, error: null };
    const props = { state, onRetry() {}, onRename: async () => {}, onDelete() {}, write: { pending: false } };
    const board = render(createElement(ProjectView, { ...props, layout: (shown: TaskDto[]) => createElement(StatusBoard, { tasks: shown, onOpen() {} }) }));
    expect(board).toContain('aria-label="Board view"');
    expect(board).not.toContain('class="sections"');
    expect(board).toContain(">Plan</button>");
    expect(render(createElement(ProjectView, props))).toContain('class="sections"');
  });
});
