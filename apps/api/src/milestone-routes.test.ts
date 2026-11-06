// Goals ticket 06 at the route seam: the goal routes (mark, criteria, goal page)
// and the task and bulk completion routes against one in-memory mirror of
// packages/server/src/milestones.ts and the completion gate in tasks.ts/bulk.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { Elysia } from "elysia";
import type { CriterionDto } from "@todalo/server/goal-dto";
import type { TaskRecord } from "@todalo/server/task-dto";
import { createGoalRoutes, type GoalStore } from "./goal-routes";
import { createTaskRoutes } from "./task-routes";
import { createBulkRoutes } from "./bulk-routes";

const ORIGIN = "http://localhost:5173";
const TAP = "33333333-3333-4333-8333-333333333333";
type Task = TaskRecord & { userId: string };
const task = (id: string, userId: string, dueDate: string | null = null): Task => ({ id, userId, title: id, description: null, status: "todo", priority: 4, projectId: null, parentId: null, dueDate: dueDate && new Date(dueDate), dueDateEnd: null, deadline: null, completedAt: null, labelIds: [] });
const goals = [{ id: "alice-fit", userId: "alice" }, { id: "alice-v2", userId: "alice" }, { id: "bob-read", userId: "bob" }];
let tasks: Task[] = [];
let links: { goalId: string; taskId: string; criteria: CriterionDto[] | null }[] = [];
beforeEach(() => {
  tasks = [task("alice-race", "alice", "2026-12-01T09:00:00.000Z"), task("alice-10k", "alice", "2026-11-15T09:00:00.000Z"), task("alice-gear", "alice"), task("bob-page", "bob")];
  links = [{ goalId: "alice-fit", taskId: "alice-race", criteria: null }, { goalId: "alice-fit", taskId: "alice-10k", criteria: null },
    { goalId: "alice-fit", taskId: "alice-gear", criteria: null }, { goalId: "alice-v2", taskId: "alice-race", criteria: null }];
});

const verify = async (headers: Headers) => headers.get("authorization")?.replace("Bearer ", "") ?? (headers.get("cookie")?.replace("session=", "") || null);
const owned = (userId: string, id: string) => tasks.find(item => item.userId === userId && item.id === id) ?? null;
const open = (userId: string, ids: string[]) => links.filter(link => ids.includes(link.taskId) && owned(userId, link.taskId) && link.criteria?.some(item => !item.done));
const tickAll = (taskId: string) => { for (const link of links) if (link.taskId === taskId && link.criteria) link.criteria = link.criteria.map(item => ({ ...item, done: true })); };
const complete = (userId: string, id: string, confirm?: boolean) => {
  const row = owned(userId, id);
  if (!row) return null;
  if (open(userId, [id]).length) { if (!confirm) return "criteria" as const; tickAll(id); }
  return Object.assign(row, { status: "done" as const });
};
const unused = async (): Promise<never> => { throw new Error("not used here"); };
const store: GoalStore = {
  verify, allowedOrigins: new Set([ORIGIN]),
  get: async (userId, id) => goals.some(goal => goal.userId === userId && goal.id === id) ? { id, title: id, description: null, archivedAt: null } : null,
  work: async (userId, goalId) => ({ projects: [], tasks: tasks.filter(item => item.userId === userId && links.some(link => link.goalId === goalId && link.taskId === item.id)) }),
  milestone: async (userId, taskId) => {
    if (!owned(userId, taskId)) return false;
    const link = links.find(item => item.taskId === taskId && item.criteria);
    return link ? { goalId: link.goalId, criteria: link.criteria! } : null;
  },
  setMilestone: async (userId, taskId, input) => {
    if (!owned(userId, taskId)) return "missing";
    const link = links.find(item => item.taskId === taskId && item.goalId === input.goalId);
    if (!link) return "unlinked";
    for (const other of links) if (other.taskId === taskId) other.criteria = null;
    link.criteria = input.criteria;
    return { goalId: input.goalId, criteria: input.criteria };
  },
  clearMilestone: async (userId, taskId) => {
    if (!owned(userId, taskId)) return false;
    for (const link of links) if (link.taskId === taskId) link.criteria = null;
    return true;
  },
  milestones: async (_userId, goalId) => links.filter(link => link.goalId === goalId && link.criteria).map(link => ({ taskId: link.taskId, criteria: link.criteria! })),
  list: unused, create: unused, update: unused, reorder: unused, hidden: unused, setHidden: unused, links: unused, link: unused, unlink: unused, tasks: unused, dismissed: unused, dismiss: unused,
};
const app = new Elysia()
  .use(createGoalRoutes(store))
  .use(createTaskRoutes({
    verify, allowedOrigins: new Set([ORIGIN]),
    complete: async (userId, id, request) => complete(userId, id, request.confirmCriteria),
    today: unused, task: unused, create: unused, update: unused, organize: unused, remove: unused,
  }))
  .use(createBulkRoutes({
    verify, allowedOrigins: new Set([ORIGIN]),
    complete: async (userId, items, _operationId, confirm) => {
      if (!items.every(item => owned(userId, item.id))) return null;
      if (!confirm && open(userId, items.map(item => item.id)).length) return "criteria";
      for (const item of items) complete(userId, item.id, true);
      return { completed: items.map(item => item.id), changed: [] };
    },
    // A status drop (board) follows the same rule as completion.
    reorder: async (userId, id, move) => {
      const row = owned(userId, id);
      if (!row) return false;
      if (move.status === "done" && row.status !== "done" && open(userId, [id]).length) { if (!move.confirmCriteria) return "criteria"; tickAll(id); }
      if (move.status) row.status = move.status;
      return true;
    },
    remove: unused, clearDates: unused, metadata: unused, move: unused,
  }));

const call = async (method: string, path: string, body?: unknown, user = "alice") => {
  const response = await app.handle(new Request(`http://localhost/api/v1${path}`, {
    method, headers: { authorization: `Bearer ${user}`, ...(body !== undefined && { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
};
const criteria = (...items: [string, boolean][]) => items.map(([text, done]) => ({ text, done }));
const page = async () => (await call("GET", "/goals/alice-fit")).body as { milestones: { task: { id: string; status: string }; criteria: CriterionDto[]; reached: boolean }[] };

describe("milestones", () => {
  it("marks a task a milestone for one linked goal, edits its ordered criteria and unmarks it", async () => {
    expect(await call("GET", "/tasks/alice-race/milestone")).toEqual({ status: 200, body: { milestone: null } });
    const marked = await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["  Register ", false], ["Taper", false]) });
    expect(marked).toEqual({ status: 200, body: { milestone: { goalId: "alice-fit", criteria: criteria(["Register", false], ["Taper", false]) } } });
    // Reorder, edit and tick are one replace of the list.
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["Taper well", false], ["Register", true]) });
    expect((await call("GET", "/tasks/alice-race/milestone")).body).toEqual({ milestone: { goalId: "alice-fit", criteria: criteria(["Taper well", false], ["Register", true]) } });
    // A task is a milestone for one goal: marking it for another linked goal moves the mark.
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-v2", criteria: [] });
    expect(links.filter(link => link.criteria).map(link => link.goalId)).toEqual(["alice-v2"]);
    expect(await call("DELETE", "/tasks/alice-race/milestone")).toEqual({ status: 200, body: { milestone: null } });
    expect(links.every(link => link.criteria === null)).toBe(true);
    expect(links).toHaveLength(4);
  });

  it("requires a goal link, an owned task and valid criteria", async () => {
    expect(await call("PUT", "/tasks/alice-10k/milestone", { goalId: "alice-v2", criteria: [] })).toEqual({ status: 409, body: { code: "GOAL_NOT_LINKED", message: "Link this goal to the task before making it a milestone." } });
    expect((await call("PUT", "/tasks/bob-page/milestone", { goalId: "alice-fit", criteria: [] })).status).toBe(404);
    expect((await call("GET", "/tasks/alice-race/milestone", undefined, "bob")).status).toBe(404);
    expect((await call("DELETE", "/tasks/alice-race/milestone", undefined, "bob")).status).toBe(404);
    for (const body of [{ goalId: "alice-fit", criteria: [{ text: " ", done: false }] }, { goalId: "alice-fit" }, { goalId: "alice-fit", criteria: [], userId: "bob" }]) {
      expect((await call("PUT", "/tasks/alice-race/milestone", body)).status).toBe(400);
    }
    expect(links.every(link => link.criteria === null)).toBe(true);
  });

  it("lists the goal's milestones by due date with criteria; reached only when every criterion is ticked", async () => {
    await call("PUT", "/tasks/alice-gear/milestone", { goalId: "alice-fit", criteria: criteria(["Shoes", true]) });
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["Register", true], ["Taper", false]) });
    await call("PUT", "/tasks/alice-10k/milestone", { goalId: "alice-fit", criteria: [] });
    const { milestones } = await page();
    expect(milestones.map(item => [item.task.id, item.criteria.filter(c => c.done).length, item.criteria.length, item.reached]))
      .toEqual([["alice-10k", 0, 0, false], ["alice-race", 1, 2, false], ["alice-gear", 1, 1, true]]);
  });

  it("refuses to complete a milestone with open criteria until confirmed, then ticks them all", async () => {
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["Register", true], ["Taper", false]) });
    const refused = await call("POST", "/tasks/alice-race/complete", { operationId: TAP });
    expect(refused).toEqual({ status: 428, body: { code: "MILESTONE_CRITERIA_OPEN", message: "This milestone has open done criteria. Confirm to tick them all and complete it." } });
    expect(owned("alice", "alice-race")!.status).toBe("todo");
    expect((await call("POST", "/tasks/alice-race/complete", { operationId: TAP, confirmCriteria: true })).status).toBe(200);
    expect((await page()).milestones[0]).toMatchObject({ task: { id: "alice-race", status: "done" }, criteria: criteria(["Register", true], ["Taper", true]), reached: true });
    // Ordinary tasks and fully ticked milestones complete without a confirm.
    expect((await call("POST", "/tasks/alice-gear/complete")).status).toBe(200);
  });

  it("bulk complete refuses the whole selection while a milestone has open criteria", async () => {
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["Taper", false]) });
    const selection = { operationId: TAP, tasks: [{ id: "alice-gear", occurrence: null }, { id: "alice-race", occurrence: null }] };
    expect(await call("POST", "/bulk/complete", selection)).toMatchObject({ status: 428, body: { code: "MILESTONE_CRITERIA_OPEN" } });
    expect(tasks.filter(item => item.status === "done")).toEqual([]);
    expect(await call("POST", "/bulk/complete", { ...selection, confirmCriteria: true })).toEqual({ status: 200, body: { completed: ["alice-gear", "alice-race"], changed: [] } });
    expect(links.find(link => link.taskId === "alice-race" && link.criteria)!.criteria).toEqual(criteria(["Taper", true]));
  });

  it("a board drop into Done follows the same rule; other columns never ask", async () => {
    await call("PUT", "/tasks/alice-race/milestone", { goalId: "alice-fit", criteria: criteria(["Taper", false]) });
    expect((await call("POST", "/tasks/alice-race/reorder", { status: "in_progress" })).status).toBe(200);
    expect(await call("POST", "/tasks/alice-race/reorder", { status: "done" })).toMatchObject({ status: 428, body: { code: "MILESTONE_CRITERIA_OPEN" } });
    expect(owned("alice", "alice-race")!.status).toBe("in_progress");
    expect(await call("POST", "/tasks/alice-race/reorder", { status: "done", confirmCriteria: true })).toEqual({ status: 200, body: { id: "alice-race" } });
    expect((await page()).milestones[0]).toMatchObject({ task: { status: "done" }, criteria: criteria(["Taper", true]), reached: true });
  });
});
