import { beforeEach, describe, expect, it } from "vitest";
import { defaultRitualSettings, type RitualKind, type RitualRunDto, type RitualSettingsDto, type RitualsDto, type RunStatus, type WeeklyReviewDto } from "@todalo/server/ritual-dto";
import type { WeekTask } from "@todalo/server/weekly-review";
import { createRitualRoutes } from "./ritual-routes";

const goals = [
  { id: "alice-fit", userId: "alice", archived: false },
  { id: "alice-v2", userId: "alice", archived: false },
  { id: "alice-old", userId: "alice", archived: true },
  { id: "bob-read", userId: "bob", archived: false },
];
let settings: Map<string, { settings: RitualSettingsDto; checkInTaskId: string | null }>;
let runs: (RitualRunDto & { userId: string })[];
let taskStarts: Map<string, Date | null>;
let clock: Date;
// Ticket 13: the current season's goals per user, goal links and the users' tasks.
const seasonGoals: Record<string, string[]> = { alice: ["alice-fit", "alice-v2"], bob: ["bob-read"] };
const links = { projects: [{ goalId: "alice-v2", projectId: "p-v2" }], tasks: [{ goalId: "alice-fit", taskId: "run" }, { goalId: "bob-read", taskId: "bob-book" }] };
let weekTasks: (WeekTask & { userId: string })[];
beforeEach(() => {
  weekTasks = [];
  settings = new Map();
  runs = [];
  taskStarts = new Map();
  clock = new Date("2026-03-10T07:00:00Z");
});

// In-memory mirror of packages/server/src/rituals.ts.
const settingsOf = (userId: string) => settings.get(userId) ?? { settings: defaultRitualSettings, checkInTaskId: null };
const app = createRitualRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  now: () => clock,
  settings: async (userId) => settingsOf(userId),
  save: async (userId, input) => { settings.set(userId, { settings: input, checkInTaskId: settingsOf(userId).checkInTaskId }); },
  runStatus: async (userId, kind: RitualKind, period): Promise<RunStatus | null> => runs.find(run => run.userId === userId && run.kind === kind && run.period === period)?.status ?? null,
  record: async (userId, input) => {
    if (input.ratings.some(rating => !goals.some(goal => goal.id === rating.goalId && goal.userId === userId && !goal.archived))) return null;
    runs = runs.filter(run => !(run.userId === userId && run.kind === input.kind && run.period === input.period));
    const run = { id: `run-${runs.length + 1}`, ...input, ratings: input.ratings.map(rating => ({ ...rating, context: rating.context ?? null })) };
    runs.push({ ...run, userId });
    return run;
  },
  checkInTask: async (userId) => {
    const id = settingsOf(userId).checkInTaskId;
    return id && taskStarts.has(id) ? { id, dueDate: taskStarts.get(id)! } : null;
  },
  placeCheckIn: async (userId, start) => {
    const current = settingsOf(userId);
    if (!start) { if (current.checkInTaskId) taskStarts.delete(current.checkInTaskId); settings.set(userId, { ...current, checkInTaskId: null }); return null; }
    const id = current.checkInTaskId && taskStarts.has(current.checkInTaskId) ? current.checkInTaskId : `task-${userId}-${taskStarts.size + 1}`;
    taskStarts.set(id, start);
    settings.set(userId, { ...current, checkInTaskId: id });
    return id;
  },
  weekInputs: async (userId, { from, to, firstDay, lastDay }) => {
    const within = (date: Date | null) => date !== null && date >= from && date < to;
    const review = runs.find(run => run.userId === userId && run.kind === "weeklyReview" && run.period === firstDay) ?? null;
    return {
      goalIds: seasonGoals[userId] ?? [], links,
      tasks: weekTasks.filter(task => task.userId === userId && (within(task.dueDate) || within(task.completedAt))),
      checkIns: runs.filter(run => run.userId === userId && run.kind === "checkIn" && run.status === "completed" && run.period >= firstDay && run.period <= lastDay)
        .flatMap(run => run.ratings.map(({ goalId, rating }) => ({ goalId, day: run.period, rating }))),
      review: review && { id: review.id, kind: review.kind, period: review.period, status: review.status, ratings: review.ratings, planning: review.planning },
    };
  },
});

const call = (method: string, path: string, init: { user?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
const zone = "Europe/Zurich";
const q = `?timeZone=${encodeURIComponent(zone)}`;
const read = async (user = "alice") => (await (await call("GET", `/rituals${q}`, { user })).json()) as RitualsDto;
const enable = (patch: Partial<RitualSettingsDto> = {}, user = "alice") =>
  call("PUT", `/rituals/settings${q}`, { user, body: { ...defaultRitualSettings, checkIn: { enabled: true, time: "09:00" }, ...patch } });
const record = (body: unknown, user = "alice") => call("POST", `/rituals/runs${q}`, { user, body });
const startOf = (taskId: string | null) => taskId ? taskStarts.get(taskId)?.toISOString() : undefined;

describe("ritual API", () => {
  it("rejects unauthenticated requests and writes from another origin", async () => {
    for (const [method, path, body] of [["GET", "/rituals"], ["PUT", "/rituals/settings", defaultRitualSettings], ["POST", "/rituals/runs", { kind: "checkIn", period: "2026-03-09", status: "skipped", ratings: [] }]] as const) {
      const response = await call(method, path, { origin: "http://localhost:5173", body });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
    const foreign = await call("PUT", "/rituals/settings", { origin: "https://evil.example", body: defaultRitualSettings });
    expect(foreign.status).toBe(403);
  });

  it("starts with every ritual off and nothing on the schedule", async () => {
    const response = await call("GET", `/rituals${q}`, { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ settings: defaultRitualSettings, checkIn: { period: "2026-03-09", status: null, taskId: null }, weeklyReview: { period: "2026-03-02", status: null } });
    expect(taskStarts.size).toBe(0);
  });

  it("saves which rituals run and when, and refuses invalid times and days", async () => {
    const chosen = { checkIn: { enabled: true, time: "08:30" }, weeklyReview: { enabled: true, day: 0, time: "18:00" }, seasonReview: { enabled: true } };
    expect((await (await call("PUT", `/rituals/settings${q}`, { user: "alice", body: chosen })).json() as any).settings).toEqual(chosen);
    expect((await read()).settings).toEqual(chosen);
    expect((await read("bob")).settings).toEqual(defaultRitualSettings);
    for (const bad of [{ ...chosen, checkIn: { enabled: true, time: "25:00" } }, { ...chosen, weeklyReview: { enabled: true, day: 7, time: "18:00" } }, { ...chosen, extra: 1 }]) {
      expect((await call("PUT", `/rituals/settings${q}`, { user: "alice", body: bad })).status).toBe(400);
    }
  });

  it("puts the Check-in on today's schedule at its time in the user's zone, and removes it when turned off", async () => {
    const { checkIn } = await (await enable()).json() as any;
    // 09:00 in Zurich (UTC+1 in March) on 2026-03-10.
    expect(startOf(checkIn.taskId)).toBe("2026-03-10T08:00:00.000Z");
    // Changing the time moves the same item.
    const moved = await (await enable({ checkIn: { enabled: true, time: "07:15" } })).json() as any;
    expect(moved.checkIn.taskId).toBe(checkIn.taskId);
    expect(startOf(checkIn.taskId)).toBe("2026-03-10T06:15:00.000Z");
    const off = await (await enable({ checkIn: { enabled: false, time: "07:15" } })).json() as any;
    expect(off.checkIn.taskId).toBeNull();
    expect(taskStarts.size).toBe(0);
  });

  it("records a Check-in's ratings for yesterday with optional context, then moves the item to tomorrow", async () => {
    await enable();
    const response = await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [
      { goalId: "alice-fit", rating: "massive", context: "  Ran 10k  " }, { goalId: "alice-v2", rating: "not_relevant" },
    ] });
    expect(response.status).toBe(201);
    const { run, rituals } = await response.json() as any;
    expect(run).toEqual({ id: "run-1", kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [
      { goalId: "alice-fit", rating: "massive", context: "Ran 10k" }, { goalId: "alice-v2", rating: "not_relevant", context: null },
    ], planning: null });
    expect(rituals.checkIn.status).toBe("completed");
    expect(startOf(rituals.checkIn.taskId)).toBe("2026-03-11T08:00:00.000Z");
    // Redoing the same day replaces the run instead of adding another.
    await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [{ goalId: "alice-fit", rating: "solid" }] });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.ratings).toEqual([{ goalId: "alice-fit", rating: "solid", context: null }]);
  });

  it("records the planning answer: 'No, I've got a clear idea' or help planning, both completing the Check-in", async () => {
    await enable();
    const clear = await (await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [{ goalId: "alice-fit", rating: "solid" }], planning: "clear" })).json() as any;
    expect(clear.run.planning).toBe("clear");
    expect(clear.rituals.checkIn.status).toBe("completed");
    expect(startOf(clear.rituals.checkIn.taskId)).toBe("2026-03-11T08:00:00.000Z");
    // Asking for help (planning by hand on today's schedule, no AI needed) completes it too; a redo replaces the answer.
    const help = await (await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [], planning: "help" })).json() as any;
    expect(help.run.planning).toBe("help");
    expect(help.rituals.checkIn.status).toBe("completed");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.planning).toBe("help");
    // Unanswered is null; a skip carries no answer; anything else is refused.
    expect((await (await record({ kind: "checkIn", period: "2026-03-08", status: "completed", ratings: [] })).json() as any).run.planning).toBeNull();
    expect((await record({ kind: "checkIn", period: "2026-03-09", status: "skipped", ratings: [], planning: "clear" })).status).toBe(400);
    expect((await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [], planning: "maybe" })).status).toBe(400);
  });

  it("skipping is always possible, has no ratings and also moves the item on", async () => {
    await enable();
    const { rituals } = await (await record({ kind: "checkIn", period: "2026-03-09", status: "skipped", ratings: [] })).json() as any;
    expect(rituals.checkIn.status).toBe("skipped");
    expect(startOf(rituals.checkIn.taskId)).toBe("2026-03-11T08:00:00.000Z");
    expect((await record({ kind: "checkIn", period: "2026-03-09", status: "skipped", ratings: [{ goalId: "alice-fit", rating: "solid" }] })).status).toBe(400);
  });

  it("refuses ratings for foreign, archived or unknown goals and invalid ratings", async () => {
    for (const goalId of ["bob-read", "alice-old", "nope"]) {
      expect((await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [{ goalId, rating: "solid" }] })).status).toBe(404);
    }
    for (const ratings of [[{ goalId: "alice-fit", rating: "great" }], [{ goalId: "alice-fit", rating: "solid" }, { goalId: "alice-fit", rating: "mixed" }]]) {
      expect((await record({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings })).status).toBe(400);
    }
    expect((await record({ kind: "checkIn", period: "2026-02-30", status: "completed", ratings: [] })).status).toBe(400);
    expect(runs).toHaveLength(0);
  });

  it("brings a missed Check-in forward to today instead of leaving it overdue", async () => {
    await enable();
    // Two days later, nothing was done: the item is on today, not on the 10th.
    clock = new Date("2026-03-12T10:00:00Z");
    const { checkIn } = await read();
    expect(checkIn).toMatchObject({ period: "2026-03-11", status: null });
    expect(startOf(checkIn.taskId)).toBe("2026-03-12T08:00:00.000Z");
    // A Check-in moved later by hand stays put.
    taskStarts.set(checkIn.taskId!, new Date("2026-03-12T15:00:00Z"));
    await read();
    expect(startOf(checkIn.taskId)).toBe("2026-03-12T15:00:00.000Z");
  });

  it("re-creates the Check-in item when it was deleted while the ritual is on", async () => {
    const { checkIn } = await (await enable()).json() as any;
    taskStarts.delete(checkIn.taskId);
    const again = (await read()).checkIn.taskId;
    expect(again).not.toBeNull();
    expect(startOf(again)).toBe("2026-03-10T08:00:00.000Z");
  });

  it("records weekly and season reviews without touching the Check-in item", async () => {
    await enable();
    const before = startOf((await read()).checkIn.taskId);
    const { run } = await (await record({ kind: "weeklyReview", period: "2026-03-02", status: "completed", ratings: [{ goalId: "alice-fit", rating: "mixed" }] })).json() as any;
    expect(run).toMatchObject({ kind: "weeklyReview", period: "2026-03-02" });
    expect(startOf((await read()).checkIn.taskId)).toBe(before);
  });

  it("summarises each current-season goal's week: Check-in ratings, tasks completed, minutes scheduled and kept", async () => {
    // Sunday 2026-03-15 in Zurich: the review looks back on the week of Monday 9 March.
    clock = new Date("2026-03-15T16:00:00Z");
    const task = (id: string, patch: Partial<WeekTask>, userId = "alice") => weekTasks.push({ id, userId, projectId: null, status: "todo", dueDate: null, dueDateEnd: null, completedAt: null, ...patch });
    task("run", { status: "done", dueDate: new Date("2026-03-10T06:00:00Z"), dueDateEnd: new Date("2026-03-10T07:00:00Z"), completedAt: new Date("2026-03-10T07:00:00Z") });
    task("spec", { projectId: "p-v2", dueDate: new Date("2026-03-12T13:00:00Z"), dueDateEnd: new Date("2026-03-12T15:00:00Z") });
    task("ship", { projectId: "p-v2", status: "done", completedAt: new Date("2026-03-13T10:00:00Z") });
    // Last week's work and another user's linked task stay out.
    task("run-before", { projectId: "p-v2", status: "done", dueDate: new Date("2026-03-06T08:00:00Z"), completedAt: new Date("2026-03-06T09:00:00Z") });
    task("bob-book", { status: "done", dueDate: new Date("2026-03-10T08:00:00Z"), completedAt: new Date("2026-03-10T09:00:00Z") }, "bob");
    await record({ kind: "checkIn", period: "2026-03-10", status: "completed", ratings: [{ goalId: "alice-fit", rating: "massive" }] });
    await record({ kind: "checkIn", period: "2026-03-08", status: "completed", ratings: [{ goalId: "alice-fit", rating: "little" }] });

    const response = await call("GET", `/rituals/weekly-review${q}`, { user: "alice" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      period: "2026-03-09", nextWeek: "2026-03-16", status: null, ratings: [], planning: null,
      goals: [
        { goalId: "alice-fit", checkIns: [{ day: "2026-03-10", rating: "massive" }], completed: 1, scheduledMinutes: 60, keptMinutes: 60 },
        { goalId: "alice-v2", checkIns: [], completed: 1, scheduledMinutes: 120, keptMinutes: 0 },
      ],
    } satisfies WeeklyReviewDto);
    expect((await read()).weeklyReview).toEqual({ period: "2026-03-09", status: null });
    expect((await call("GET", `/rituals/weekly-review${q}`)).status).toBe(401);
  });

  it("rates the week per goal and records the next-week planning answer; a redo replaces it", async () => {
    clock = new Date("2026-03-15T16:00:00Z");
    const created = await record({ kind: "weeklyReview", period: "2026-03-09", status: "completed", ratings: [
      { goalId: "alice-fit", rating: "solid", context: "Three runs" }, { goalId: "alice-v2", rating: "little" },
    ], planning: "help" });
    expect(created.status).toBe(201);
    expect((await created.json() as any).rituals.weeklyReview).toEqual({ period: "2026-03-09", status: "completed" });
    const review = await (await call("GET", `/rituals/weekly-review${q}`, { user: "alice" })).json() as WeeklyReviewDto;
    expect(review).toMatchObject({ status: "completed", planning: "help", ratings: [{ goalId: "alice-fit", rating: "solid", context: "Three runs" }, { goalId: "alice-v2", rating: "little", context: null }] });
    await record({ kind: "weeklyReview", period: "2026-03-09", status: "completed", ratings: [{ goalId: "alice-fit", rating: "massive" }], planning: "clear" });
    expect(runs.filter(run => run.kind === "weeklyReview")).toHaveLength(1);
    expect(((await (await call("GET", `/rituals/weekly-review${q}`, { user: "alice" })).json()) as WeeklyReviewDto).planning).toBe("clear");
    // Bob sees neither; a week must start on its Monday; foreign goals are refused.
    expect(((await (await call("GET", `/rituals/weekly-review${q}`, { user: "bob" })).json()) as WeeklyReviewDto).status).toBeNull();
    expect((await record({ kind: "weeklyReview", period: "2026-03-10", status: "completed", ratings: [] })).status).toBe(400);
    expect((await record({ kind: "weeklyReview", period: "2026-03-09", status: "completed", ratings: [{ goalId: "bob-read", rating: "solid" }] })).status).toBe(404);
    // Skipping the week is allowed and shows as skipped.
    const skipped = await (await record({ kind: "weeklyReview", period: "2026-03-09", status: "skipped", ratings: [] })).json() as any;
    expect(skipped.rituals.weeklyReview.status).toBe("skipped");
  });
});
