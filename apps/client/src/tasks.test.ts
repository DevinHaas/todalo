import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { browserTaskTransport, dueLabel, taskKeys, todayHeading, todaySections, type TaskDto } from "./tasks";
import { TaskView, TodayView } from "./views";

const local = (day: number, hours = 0, minutes = 0) => new Date(2026, 9, day, hours, minutes).toISOString();
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], ...extra,
});
const now = new Date(2026, 9, 4, 10);
const respond = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};

describe("Today read model", () => {
  it("groups open tasks into overdue and today in the viewer's local day, keeping subtasks under parents", () => {
    const tasks = [
      task("child", { parentId: "parent", dueDate: local(4, 9) }),
      task("overdue", { dueDate: local(3, 23, 59) }),
      task("midnight", { dueDate: local(4) }),
      task("parent", { dueDate: local(4, 8) }),
      task("tomorrow", { dueDate: local(5) }),
      task("undated"),
      task("done-overdue", { dueDate: local(1), status: "done" }),
    ];
    const sections = todaySections(tasks, now);
    expect(sections.overdue.map(item => item.id)).toEqual(["overdue"]);
    expect(sections.today.map(item => item.id)).toEqual(["midnight", "parent", "child"]);
  });

  it("formats legacy date labels", () => {
    expect(dueLabel(local(4))).toBe("4 Oct");
    expect(dueLabel(local(3, 12))).toBe("3 Oct 12:00");
    expect(todayHeading(now)).toBe("4 Oct · Today · Sunday");
  });

  it("scopes every cache key to the signed-in user", () => {
    expect(taskKeys.today("alice")).toEqual(["user", "alice", "today"]);
    expect(taskKeys.task("alice", "t1").slice(0, 2)).toEqual(taskKeys.user("alice"));
    expect(taskKeys.today("bob")).not.toEqual(taskKeys.today("alice"));
  });
});

describe("browser task transport", () => {
  it("maps not-found to null and failures to safe errors", async () => {
    expect(await browserTaskTransport(respond(404, { code: "NOT_FOUND" })).task("other-user-task")).toBeNull();
    await expect(browserTaskTransport(respond(401)).today()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(browserTaskTransport(respond(500)).today()).rejects.toMatchObject({ code: "TASKS_UNAVAILABLE" });
    await expect(browserTaskTransport((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch).today())
      .rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });

  it("encodes task IDs into one path segment", async () => {
    let requested = "";
    const fetcher = (async (path: string) => { requested = path; return new Response(JSON.stringify({ task: task("x") })); }) as unknown as typeof fetch;
    expect((await browserTaskTransport(fetcher).task("../account"))?.id).toBe("x");
    expect(requested).toBe("/api/v1/tasks/..%2Faccount");
  });
});

describe("Today and task screens", () => {
  it("renders loading, error, empty and populated Today states", () => {
    expect(render(createElement(TodayView, { state: { status: "pending", error: null }, onRetry: noop, now }))).toContain("Loading tasks…");
    const failed = render(createElement(TodayView, { state: { status: "error", error: new Error("Cannot reach todalo."), }, onRetry: noop, now }));
    expect(failed).toContain("Cannot reach todalo.");
    expect(failed).toContain("Try again");
    expect(render(createElement(TodayView, { state: { status: "success", data: { tasks: [], openCount: 0 }, error: null }, onRetry: noop, now })))
      .toContain("Nothing is due today.");
    const full = render(createElement(TodayView, { state: { status: "success", error: null, data: { openCount: 2, tasks: [
      task("late", { title: "Review the migration checklist", dueDate: local(3, 12), priority: 2 }),
      task("now", { title: "Plan the first shared screen", dueDate: local(4, 14, 30), labelIds: ["l"] }),
    ] } }, onRetry: noop, now }));
    expect(full).toContain("2 tasks");
    expect(full).toContain("Overdue");
    expect(full).toContain('href="/tasks/now"');
    expect(full).toContain("P2");
    expect(full).not.toContain("Nothing is due today.");
  });

  it("renders a read-only task and a not-found state for inaccessible IDs", () => {
    const detail = render(createElement(TaskView, { state: { status: "success", error: null, data: task("t", { title: "Plan", description: "Line 1\nLine 2", priority: 2, dueDate: local(4, 14, 30) }) }, onRetry: noop }));
    expect(detail).toContain("Plan");
    expect(detail).toContain("Priority 2 · Due 4 Oct 14:30");
    expect(detail).not.toContain("<input");
    expect(render(createElement(TaskView, { state: { status: "success", data: null, error: null }, onRetry: noop }))).toContain("Task not found");
  });
});
