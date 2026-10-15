import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import {
  browserTaskTransport, dueLabel, operationId, taskKeys, taskMutations, todayHeading, todaySections,
  type NewTask, type TaskDetails, type TaskDto, type TaskTransport, type TodayDto,
} from "./tasks";
import { Composer, TaskEditor, TaskView, TodayView } from "./views";
import { dateInputValue, localInstant, repeatChoice, repeatLabel, timeInputValue } from "./tasks";

const local = (day: number, hours = 0, minutes = 0) => new Date(2026, 9, day, hours, minutes).toISOString();
const task = (id: string, extra: Partial<TaskDto> = {}): TaskDto => ({
  id, title: id, description: null, status: "todo", priority: 4, projectId: null, parentId: null,
  dueDate: null, dueDateEnd: null, deadline: null, completedAt: null, labelIds: [], recurrence: null, updatedAt: null, ...extra,
});
const now = new Date(2026, 9, 4, 10);
const respond = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;
const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, node));
const noop = () => {};
const TAP = "0b6f2f8e-1c1a-4f4e-8a55-3a3d6e1c2b10";
const details: TaskDetails = {
  updatedAt: "2026-10-04T08:00:00.000Z", title: "Plan", description: "", priority: 2, deadline: null,
  dueDate: local(5, 9), dueDateEnd: local(5, 10), recurrence: { n: 1, unit: "week", basedOn: "scheduled" },
};

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

describe("browser task writes", () => {
  it("sends the basic task, the completion occurrence and tap ID, and edits; maps write failures", async () => {
    const sent: { method: string; path: string; body: unknown }[] = [];
    const fetcher = (async (path: string, init: RequestInit) => {
      sent.push({ method: init.method!, path, body: init.body ? JSON.parse(init.body as string) : undefined });
      return new Response(JSON.stringify(init.method === "DELETE" ? { id: "t" } : { task: task("t") }));
    }) as unknown as typeof fetch;
    const transport = browserTaskTransport(fetcher);
    const input: NewTask = { id: operationId(), title: "Plan", dueDate: local(4) };
    expect((await transport.create(input)).id).toBe("t");
    expect((await transport.complete("a/b", local(4), TAP))?.id).toBe("t");
    expect((await transport.update("a/b", details))?.id).toBe("t");
    expect(await transport.remove("t")).toBe(true);
    expect(sent).toEqual([
      { method: "POST", path: "/api/v1/tasks", body: input },
      { method: "POST", path: "/api/v1/tasks/a%2Fb/complete", body: { occurrence: local(4), operationId: TAP } },
      { method: "PATCH", path: "/api/v1/tasks/a%2Fb", body: details },
      { method: "DELETE", path: "/api/v1/tasks/t", body: undefined },
    ]);
    await expect(browserTaskTransport(respond(412, { code: "TASK_CHANGED" })).update("t", details)).rejects.toMatchObject({ code: "TASK_CHANGED" });
    await expect(browserTaskTransport(respond(412, { code: "TASK_CHANGED" })).complete("t", null, TAP)).rejects.toMatchObject({ code: "TASK_CHANGED" });
    expect(await browserTaskTransport(respond(404, { code: "NOT_FOUND" })).update("gone", details)).toBeNull();
    expect(await browserTaskTransport(respond(404, { code: "NOT_FOUND" })).remove("gone")).toBe(false);
    expect(await browserTaskTransport(respond(404, { code: "NOT_FOUND" })).complete("gone", null, TAP)).toBeNull();
    await expect(browserTaskTransport(respond(400)).create(input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(browserTaskTransport(respond(500)).create(input)).rejects.toMatchObject({ code: "SAVE_FAILED" });
    await expect(browserTaskTransport(respond(401)).remove("t")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("generates RFC 4122 v4 operation IDs without crypto.randomUUID", () => {
    expect(operationId((bytes) => bytes.fill(255))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(operationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(operationId()).not.toBe(operationId());
  });
});

describe("task mutations", () => {
  const today = taskKeys.today("alice");
  const setup = (transport: Partial<TaskTransport>, data: TodayDto = { openCount: 2, tasks: [task("a", { dueDate: local(4) }), task("b", { dueDate: local(4) })] }) => {
    const cache = new QueryClient();
    cache.setQueryData(today, data);
    const writes = taskMutations(transport as TaskTransport, cache, "alice");
    return { cache, writes };
  };

  it("retries a create whose response was lost with the same operation ID and gets one task", async () => {
    const calls: string[] = [];
    const saved = new Map<string, TaskDto>();
    const { cache, writes } = setup({
      create: async (input) => {
        calls.push(input.id);
        const first = !saved.has(input.id);
        saved.set(input.id, saved.get(input.id) ?? task(input.id, { title: input.title, dueDate: input.dueDate }));
        if (first) throw new AccountTransportError("CONNECTION_FAILED"); // applied, answer lost
        return saved.get(input.id)!;
      },
    });
    const id = operationId();
    const created = await new MutationObserver(cache, writes.create).mutate({ id, title: "Plan", dueDate: local(4) });
    expect(created.id).toBe(id);
    expect(calls).toEqual([id, id]);
    expect(saved.size).toBe(1);
    expect(cache.getQueryData(taskKeys.task("alice", id))).toEqual(created);
    expect(cache.getQueryState(today)?.isInvalidated).toBe(true);
  });

  it("does not retry a rejected create, so the composer can keep the input", async () => {
    let calls = 0;
    const { cache, writes } = setup({ create: async () => { calls += 1; throw new AccountTransportError("INVALID_INPUT"); } });
    await expect(new MutationObserver(cache, writes.create).mutate({ id: operationId(), title: "x", dueDate: null })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toBe(1);
  });

  it("completes optimistically (row and sidebar count), sends the seen occurrence, and rolls back on failure", async () => {
    let release!: (error: Error) => void;
    const occurrences: (string | null)[] = [];
    const { cache, writes } = setup({ complete: (_id, occurrence) => { occurrences.push(occurrence); return new Promise((_, reject) => { release = reject; }); } });
    const before = cache.getQueryData<TodayDto>(today)!;
    const pending = new MutationObserver(cache, writes.complete).mutate({ task: before.tasks[0], operationId: TAP });
    await Promise.resolve(); await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cache.getQueryData<TodayDto>(today)).toMatchObject({ openCount: 1, tasks: [{ id: "a", status: "done" }, { id: "b", status: "todo" }] });
    expect(occurrences).toEqual([local(4)]);
    release(new AccountTransportError("UNAUTHENTICATED"));
    await expect(pending).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(cache.getQueryData(today)).toEqual(before);
    expect(occurrences).toHaveLength(1);
  });

  it("retries a completion with the same tap ID, and rolls back a stale tap without retrying it", async () => {
    const taps: string[] = [];
    const { cache, writes } = setup({ complete: async (_id, _occurrence, operation) => { taps.push(operation); if (taps.length === 1) throw new AccountTransportError("CONNECTION_FAILED"); return task("a", { dueDate: local(5) }); } });
    await new MutationObserver(cache, { ...writes.complete, retryDelay: 0 }).mutate({ task: task("a", { dueDate: local(4) }), operationId: TAP });
    expect(taps).toEqual([TAP, TAP]);
    const stale = setup({ complete: async () => { taps.push("stale"); throw new AccountTransportError("TASK_CHANGED"); } });
    const before = stale.cache.getQueryData(today);
    await expect(new MutationObserver(stale.cache, stale.writes.complete).mutate({ task: task("a", { dueDate: local(4) }), operationId: TAP })).rejects.toMatchObject({ code: "TASK_CHANGED" });
    expect(taps.filter(tap => tap === "stale")).toHaveLength(1);
    expect(stale.cache.getQueryData(today)).toEqual(before);
    expect(stale.cache.getQueryState(today)?.isInvalidated).toBe(true);
  });

  it("saves an edit, retries a lost response with the same body, and refreshes the task, Today and project lists", async () => {
    const bodies: TaskDetails[] = [];
    const { cache, writes } = setup({ update: async (_id, body) => { bodies.push(body); if (bodies.length === 1) throw new AccountTransportError("SAVE_FAILED"); return task("a", { title: body.title, updatedAt: "2026-10-04T09:00:00.000Z" }); } });
    cache.setQueryData(["user", "alice", "project", "p1"], { project: {}, tasks: [] });
    const saved = await new MutationObserver(cache, { ...writes.update, retryDelay: 0 }).mutate({ id: "a", details });
    expect(bodies).toEqual([details, details]);
    expect(cache.getQueryData(taskKeys.task("alice", "a"))).toEqual(saved);
    expect(cache.getQueryState(today)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(["user", "alice", "project", "p1"])?.isInvalidated).toBe(true);
  });

  it("does not retry a stale or missing edit", async () => {
    let calls = 0;
    const changed = setup({ update: async () => { calls += 1; throw new AccountTransportError("TASK_CHANGED"); } });
    await expect(new MutationObserver(changed.cache, changed.writes.update).mutate({ id: "a", details })).rejects.toMatchObject({ code: "TASK_CHANGED" });
    const missing = setup({ update: async () => { calls += 1; return null; } });
    await expect(new MutationObserver(missing.cache, missing.writes.update).mutate({ id: "a", details })).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(calls).toBe(2);
  });

  it("deletes optimistically and treats a task already gone after a retry as deleted", async () => {
    let calls = 0;
    const { cache, writes } = setup({ remove: async () => { calls += 1; if (calls === 1) throw new AccountTransportError("SAVE_FAILED"); return false; } });
    const removed = await new MutationObserver(cache, writes.remove).mutate(task("a", { dueDate: local(4) }));
    expect(removed).toBe(false);
    expect(calls).toBe(2);
    expect(cache.getQueryData<TodayDto>(today)).toMatchObject({ openCount: 1, tasks: [{ id: "b" }] });
  });
});

describe("task write controls", () => {
  const data = { openCount: 1, tasks: [task("now", { title: "Plan", dueDate: local(4, 9) })] };
  it("activates the completion checkbox, delete and composer only when writes are wired", () => {
    const inert = render(createElement(TodayView, { state: { status: "success", error: null, data }, onRetry: noop, now }));
    expect(inert).toContain('aria-disabled="true"');
    expect(inert).not.toContain('role="checkbox"');
    const live = render(createElement(TodayView, {
      state: { status: "success", error: null, data }, onRetry: noop, now, writeError: "Your changes could not be saved. Try again.",
      actions: { complete: noop, remove: noop }, composer: createElement(Composer, { dueDate: () => local(4), onCreate: async () => {} }),
    }));
    expect(live).toContain('aria-label="Complete Plan"');
    expect(live).toContain('aria-label="Delete Plan"');
    expect(live).toContain("Your changes could not be saved. Try again.");
    expect(live).toMatch(/<button type="button" class="composer">/);
  });

  it("opens the composer with title and description inputs filed to Today or the Inbox", () => {
    const todayForm = render(createElement(Composer, { startOpen: true, dueDate: () => local(4), onCreate: async () => {} }));
    expect(todayForm).toContain('aria-label="Task name"');
    expect(todayForm).toContain('aria-label="Description"');
    expect(todayForm).toContain("Today");
    expect(render(createElement(Composer, { startOpen: true, dueDate: () => null, onCreate: async () => {} }))).toContain("Inbox");
  });
});

describe("task editor", () => {
  it("reads and writes dates in the viewer's zone, keeping all-day tasks untimed", () => {
    expect(dateInputValue(local(31, 23, 30))).toBe("2026-10-31");
    expect(timeInputValue(local(4))).toBe("");
    expect(timeInputValue(local(4, 9, 5))).toBe("09:05");
    expect(timeInputValue(local(4), false)).toBe("00:00");
    expect(localInstant("2026-10-04")).toBe(local(4));
    expect(localInstant("2026-10-04", "14:30")).toBe(local(4, 14, 30));
    expect(dateInputValue(localInstant("2026-03-29"))).toBe("2026-03-29");
  });

  it("maps recurrences to the legacy presets and describes anything else", () => {
    expect(repeatChoice(null)).toBe("none");
    expect(repeatChoice({ n: 1, unit: "week", basedOn: "scheduled", until: null })).toBe("weekly");
    expect(repeatChoice({ n: 1, unit: "day", basedOn: "completed", until: null })).toBe("custom");
    expect(repeatChoice({ n: 1, unit: "month", basedOn: "scheduled", until: local(31) })).toBe("custom");
    expect(repeatLabel({ n: 3, unit: "day", basedOn: "completed", until: local(31) })).toBe("Every 3 days after completion until 31 Oct 2026");
    expect(repeatLabel({ n: 1, unit: "year", basedOn: "scheduled", until: null })).toBe("Every year");
  });

  it("opens with the task's details, schedule and a kept custom repeat", () => {
    const html = render(createElement(TaskEditor, {
      task: task("t", { title: "Plan", description: "Notes", priority: 2, dueDate: local(5, 9), dueDateEnd: local(5, 10, 30), deadline: local(9), recurrence: { n: 2, unit: "week", basedOn: "scheduled", until: null }, updatedAt: "v1" }),
      onSave: async () => {}, onClose: noop,
    }));
    for (const fragment of ['role="dialog"', 'value="Plan"', ">Notes</textarea>", 'value="2026-10-05"', 'value="09:00"', 'value="10:30"', 'value="2026-10-09"', ">Every 2 weeks</option>", ">Does not repeat</option>", "Priority 1 — highest", ">Save</button>"]) {
      expect(html).toContain(fragment);
    }
    const allDay = render(createElement(TaskEditor, { task: task("t", { recurrence: { n: 1, unit: "day", basedOn: "scheduled", until: null } }), onSave: async () => {}, onClose: noop }));
    expect(allDay).not.toContain('aria-label="Start time"');
    expect(allDay).not.toContain("Every day</option>");
  });

  it("offers editing on the task page and shows the repeat rule", () => {
    const html = render(createElement(TaskView, { state: { status: "success", data: task("t", { dueDate: local(5), recurrence: { n: 1, unit: "month", basedOn: "scheduled", until: null } }), error: null }, onRetry: noop, onEdit: noop }));
    expect(html).toContain("Edit task details");
    expect(html).toContain("Due 5 Oct · Every month");
    expect(render(createElement(TaskView, { state: { status: "success", data: task("t"), error: null }, onRetry: noop }))).not.toContain("Edit task details");
  });
});
