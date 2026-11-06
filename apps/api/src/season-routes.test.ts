import { beforeEach, describe, expect, it } from "vitest";
import type { SeasonGoalRecord, SeasonRecord, SeasonTier } from "@todalo/server/season-dto";
import { createSeasonRoutes } from "./season-routes";

type Season = SeasonRecord & { userId: string };
type Row = { id: string; userId: string; seasonId: string; goalId: string; tier: SeasonTier; target: string; carriedFromId: string | null };
const goals = [
  { id: "alice-fit", userId: "alice", title: "Become fit", archivedAt: null },
  { id: "alice-v2", userId: "alice", title: "Ship v2", archivedAt: null },
  { id: "alice-muscle", userId: "alice", title: "Build muscle", archivedAt: null },
  { id: "alice-sleep", userId: "alice", title: "Sleep 8h", archivedAt: null },
  { id: "alice-old", userId: "alice", title: "Old goal", archivedAt: new Date() },
  { id: "bob-read", userId: "bob", title: "Read more", archivedAt: null },
];
let seasons: Season[] = [];
let rows: Row[] = [];
let clock = new Date("2026-02-21T12:00:00Z");
beforeEach(() => {
  seasons = [
    // Bob's ended season is history; his current one starts later.
    { id: "bob-old", userId: "bob", startDate: "2025-01-01", lengthDays: 28, endedAt: new Date("2025-01-29T00:00:00Z") },
  ];
  rows = [];
  clock = new Date("2026-02-21T12:00:00Z");
});

// In-memory mirror of packages/server/src/seasons.ts.
const current = (userId: string, id?: string) => seasons.find(season => season.userId === userId && !season.endedAt && (id === undefined || season.id === id)) ?? null;
const record = (row: Row): SeasonGoalRecord => {
  const goal = goals.find(item => item.id === row.goalId)!;
  return { id: row.id, goalId: row.goalId, title: goal.title, archivedAt: goal.archivedAt, tier: row.tier, target: row.target, carriedFromId: row.carriedFromId };
};
const app = createSeasonRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  now: () => clock,
  current: async (userId) => {
    const season = current(userId);
    return season && { season, goals: rows.filter(row => row.seasonId === season.id).map(record) };
  },
  start: async (userId, input) => {
    // The database's partial unique index.
    if (current(userId)) return null;
    const season = { id: `season-${seasons.length}`, userId, ...input, endedAt: null };
    seasons.push(season);
    return season;
  },
  addGoal: async (userId, seasonId, input) => {
    if (!current(userId, seasonId) || !goals.some(goal => goal.userId === userId && goal.id === input.goalId && !goal.archivedAt)) return null;
    if (rows.some(row => row.seasonId === seasonId && row.goalId === input.goalId)) return "exists";
    const row = { id: `sg-${input.goalId}`, userId, seasonId, ...input, carriedFromId: null };
    rows.push(row);
    return record(row);
  },
  updateGoal: async (userId, seasonId, goalId, patch) => {
    const row = current(userId, seasonId) && rows.find(item => item.userId === userId && item.seasonId === seasonId && item.goalId === goalId);
    if (!row) return null;
    Object.assign(row, patch);
    return record(row);
  },
  removeGoal: async (userId, seasonId, goalId) => {
    const before = rows.length;
    if (current(userId, seasonId)) rows = rows.filter(row => !(row.userId === userId && row.seasonId === seasonId && row.goalId === goalId));
    return rows.length < before;
  },
  past: async (userId) => seasons.filter(season => season.userId === userId && season.endedAt)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map(season => ({ season, goals: rows.filter(row => row.seasonId === season.id).map(record) })),
  end: async (userId, seasonId, { next }) => {
    const season = current(userId, seasonId);
    if (!season) return null;
    const history = rows.filter(row => row.seasonId === seasonId);
    const from = (goalId: string) => history.find(row => row.goalId === goalId);
    if (next?.goals.some(item => !from(item.goalId) || goals.find(goal => goal.id === item.goalId)!.archivedAt)) return null;
    // All or nothing, like the database batch: nothing is written before every check passed.
    season.endedAt = clock;
    const ended = { season, goals: history.map(record) };
    if (!next) return { ended, next: null };
    const created = { id: `season-${seasons.length}`, userId, startDate: next.startDate, lengthDays: next.lengthDays, endedAt: null };
    seasons.push(created);
    const carried = next.goals.map(item => ({ id: `sg-${created.id}-${item.goalId}`, userId, seasonId: created.id, ...item, carriedFromId: from(item.goalId)!.id }));
    rows.push(...carried);
    return { ended, next: { season: created, goals: carried.map(record) } };
  },
});

const call = (method: string, path: string, init: { user?: string; cookie?: string; origin?: string; body?: unknown } = {}) => {
  const headers = new Headers();
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
};
type Current = { season: null | { id: string; startDate: string; lengthDays: number; progress: { phase: string; day: number; length: number; daysLeft: number }; goals: { goalId: string; tier: string; target: string }[] } };
const page = async (user = "alice", zone = "UTC") => (await (await call("GET", `/seasons/current?timeZone=${encodeURIComponent(zone)}`, { user })).json()) as Current;
const start = async (user = "alice", body: unknown = { startDate: "2026-01-01", lengthDays: 84 }) => call("POST", "/seasons", { user, body });

describe("season API", () => {
  it("rejects every unauthenticated operation with the shared envelope", async () => {
    for (const [method, path, body] of [["GET", "/seasons/current"], ["POST", "/seasons", { startDate: "2026-01-01", lengthDays: 84 }],
      ["POST", "/seasons/season-1/goals", { goalId: "alice-fit", tier: "primary", target: "x" }], ["PATCH", "/seasons/season-1/goals/alice-fit", { target: "x" }],
      ["DELETE", "/seasons/season-1/goals/alice-fit"], ["GET", "/seasons/past"], ["POST", "/seasons/season-1/end", { next: null }]] as const) {
      const response = await call(method, path, { origin: "http://localhost:5173", body });
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(await response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    }
  });

  it("has no current season before the first; ended seasons are not current", async () => {
    const response = await call("GET", "/seasons/current", { user: "alice" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ season: null });
    expect(await page("bob")).toEqual({ season: null });
  });

  it.each([["12 weeks", 84], ["4 weeks", 28], ["a custom 45 days", 45]])("starts a season of %s and shows Day X of Y with days left", async (_name, lengthDays) => {
    const created = await start("alice", { startDate: "2026-02-12", lengthDays });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ season: { id: "season-1", startDate: "2026-02-12", lengthDays, endedAt: null, goals: [] } });
    expect((await page()).season).toMatchObject({ id: "season-1", startDate: "2026-02-12", lengthDays, progress: { phase: "running", day: 10, length: lengthDays, daysLeft: lengthDays - 10 }, goals: [] });
  });

  it("counts days in the client's timezone", async () => {
    await start();
    clock = new Date("2026-02-21T23:30:00Z");
    expect((await page("alice", "UTC")).season?.progress.day).toBe(52);
    expect((await page("alice", "Pacific/Auckland")).season?.progress.day).toBe(53);
    // An unknown zone falls back to UTC rather than failing the page.
    expect((await page("alice", "Mars/Olympus")).season?.progress.day).toBe(52);
  });

  it("allows only one current season per user", async () => {
    expect((await start()).status).toBe(201);
    const second = await start("alice", { startDate: "2026-03-01", lengthDays: 28 });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: "SEASON_EXISTS" });
    expect((await page()).season?.id).toBe("season-1");
    // Bob's ended season does not block his next one; users are independent.
    expect((await start("bob", { startDate: "2026-03-01", lengthDays: 28 })).status).toBe(201);
  });

  it("refuses invalid starts", async () => {
    for (const body of [{ startDate: "2026-02-30", lengthDays: 84 }, { startDate: "1/1/2026", lengthDays: 84 }, { startDate: "2026-01-01", lengthDays: 0 },
      { startDate: "2026-01-01", lengthDays: 2.5 }, { startDate: "2026-01-01", lengthDays: 367 }, { startDate: "2026-01-01" }, { startDate: "2026-01-01", lengthDays: 84, userId: "bob" }]) {
      const response = await start("alice", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
    expect(seasons.filter(season => season.userId === "alice")).toEqual([]);
  });

  it("adds goals as primary or secondary with a trimmed target in words", async () => {
    await start();
    const added = await call("POST", "/seasons/season-1/goals", { user: "alice", body: { goalId: "alice-fit", tier: "primary", target: "  Run a half marathon " } });
    expect(added.status).toBe(201);
    expect(await added.json()).toEqual({ goal: { id: "sg-alice-fit", goalId: "alice-fit", title: "Become fit", archived: false, tier: "primary", target: "Run a half marathon", carriedFromId: null } });
    await call("POST", "/seasons/season-1/goals", { user: "alice", body: { goalId: "alice-v2", tier: "secondary", target: "Beta to 10 users" } });
    expect((await page()).season?.goals.map(goal => [goal.goalId, goal.tier, goal.target])).toEqual([["alice-fit", "primary", "Run a half marathon"], ["alice-v2", "secondary", "Beta to 10 users"]]);
    const twice = await call("POST", "/seasons/season-1/goals", { user: "alice", body: { goalId: "alice-fit", tier: "secondary", target: "Again" } });
    expect(twice.status).toBe(409);
    for (const body of [{ goalId: "alice-sleep", tier: "main", target: "x" }, { goalId: "alice-sleep", tier: "primary", target: "  " }, { goalId: "alice-sleep", tier: "primary" }, { goalId: "alice-sleep", tier: "primary", target: "x".repeat(1_001) }]) {
      expect((await call("POST", "/seasons/season-1/goals", { user: "alice", body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("accepts a fourth primary goal (the warning is the client's, not a block)", async () => {
    await start();
    for (const goalId of ["alice-fit", "alice-v2", "alice-muscle", "alice-sleep"]) {
      expect((await call("POST", "/seasons/season-1/goals", { user: "alice", body: { goalId, tier: "primary", target: "Something" } })).status).toBe(201);
    }
    expect((await page()).season?.goals.filter(goal => goal.tier === "primary")).toHaveLength(4);
  });

  it("refuses foreign, missing and archived goals and foreign, missing or ended seasons with one 404", async () => {
    await start();
    await start("bob", { startDate: "2026-02-01", lengthDays: 28 });
    const add = (season: string, goalId: string) => call("POST", `/seasons/${season}/goals`, { user: "alice", body: { goalId, tier: "primary", target: "x" } });
    const responses = await Promise.all([add("season-1", "bob-read"), add("season-1", "nope"), add("season-1", "alice-old"), add("season-2", "alice-fit"), add("bob-old", "alice-fit"), add("nope", "alice-fit")]);
    expect(responses.map(response => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(await responses[0]!.json()).toEqual(await responses[5]!.json());
    expect(rows).toEqual([]);
  });

  it("moves a goal's target mid-season and changes its tier; the old text is replaced", async () => {
    await start();
    await call("POST", "/seasons/season-1/goals", { user: "alice", body: { goalId: "alice-fit", tier: "primary", target: "Run a 10k" } });
    const moved = await call("PATCH", "/seasons/season-1/goals/alice-fit", { user: "alice", body: { target: " Run a half marathon " } });
    expect(await moved.json()).toMatchObject({ goal: { goalId: "alice-fit", tier: "primary", target: "Run a half marathon" } });
    const demoted = await call("PATCH", "/seasons/season-1/goals/alice-fit", { user: "alice", body: { tier: "secondary" } });
    expect(await demoted.json()).toMatchObject({ goal: { tier: "secondary", target: "Run a half marathon" } });
    expect((await page()).season?.goals).toMatchObject([{ goalId: "alice-fit", tier: "secondary", target: "Run a half marathon" }]);
    for (const body of [{}, { target: "" }, { tier: "top" }, { target: "x", carriedFromId: "sg-x" }]) {
      expect((await call("PATCH", "/seasons/season-1/goals/alice-fit", { user: "alice", body })).status, JSON.stringify(body)).toBe(400);
    }
    // Not in the season, or someone else's season.
    expect((await call("PATCH", "/seasons/season-1/goals/alice-v2", { user: "alice", body: { target: "x" } })).status).toBe(404);
    expect((await call("PATCH", "/seasons/season-1/goals/alice-fit", { user: "bob", body: { target: "x" } })).status).toBe(404);
  });

  it("requires an allowed Origin for cookie-authenticated writes but not for bearer writes", async () => {
    const crossSite = await call("POST", "/seasons", { cookie: "alice", origin: "https://evil.example", body: { startDate: "2026-01-01", lengthDays: 84 } });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toMatchObject({ code: "FORBIDDEN_ORIGIN" });
    expect((await call("POST", "/seasons", { cookie: "alice", body: { startDate: "2026-01-01", lengthDays: 84 } })).status).toBe(403);
    expect((await call("POST", "/seasons", { cookie: "alice", origin: "http://localhost:5173", body: { startDate: "2026-01-01", lengthDays: 84 } })).status).toBe(201);
    expect((await call("PATCH", "/seasons/season-1/goals/alice-fit", { cookie: "alice", origin: "https://evil.example", body: { target: "x" } })).status).toBe(403);
  });

  const addGoal = (goalId: string, tier: SeasonTier, target: string, season = "season-1") => call("POST", `/seasons/${season}/goals`, { user: "alice", body: { goalId, tier, target } });
  const end = (body: unknown, season = "season-1", user = "alice") => call("POST", `/seasons/${season}/end`, { user, body });
  const past = async (user = "alice") => (await (await call("GET", "/seasons/past", { user })).json()) as { seasons: { id: string; endedAt: string | null; goals: { goalId: string; tier: string; target: string; carriedFromId: string | null }[] }[] };

  it("removes a goal from the current season only, leaving the goal and other seasons alone", async () => {
    await start();
    await addGoal("alice-fit", "primary", "Run a 10k");
    await addGoal("alice-v2", "secondary", "Beta");
    const removed = await call("DELETE", "/seasons/season-1/goals/alice-fit", { user: "alice" });
    expect(await removed.json()).toEqual({ goalId: "alice-fit" });
    expect((await page()).season?.goals.map(goal => goal.goalId)).toEqual(["alice-v2"]);
    // Gone already, someone else's, or an ended season: one 404.
    expect((await call("DELETE", "/seasons/season-1/goals/alice-fit", { user: "alice" })).status).toBe(404);
    expect((await call("DELETE", "/seasons/season-1/goals/alice-v2", { user: "bob" })).status).toBe(404);
    expect((await call("DELETE", "/seasons/season-1/goals/alice-v2", { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    await end({ next: null });
    expect((await call("DELETE", "/seasons/season-1/goals/alice-v2", { user: "alice" })).status).toBe(404);
    expect((await past()).seasons[0]?.goals.map(goal => goal.goalId)).toEqual(["alice-v2"]);
  });

  it("ends a season and starts the next with the chosen goals, fresh targets and tiers (primary can become secondary)", async () => {
    clock = new Date("2026-03-26T08:00:00Z");
    await start();
    await addGoal("alice-fit", "primary", "Run a 10k");
    await addGoal("alice-v2", "primary", "Beta to 10 users");
    await addGoal("alice-sleep", "secondary", "Sleep 7h");
    const response = await end({ next: { startDate: "2026-03-26", lengthDays: 28, goals: [
      { goalId: "alice-fit", tier: "secondary", target: " Run a half marathon " }, { goalId: "alice-sleep", tier: "primary", target: "Sleep 8h" },
    ] } });
    expect(response.status).toBe(200);
    const body = await response.json() as { ended: { id: string; endedAt: string }; next: { id: string; goals: unknown[] } };
    expect(body.ended).toMatchObject({ id: "season-1", endedAt: "2026-03-26T08:00:00.000Z" });
    expect(body.next).toMatchObject({ id: "season-2", startDate: "2026-03-26", lengthDays: 28, endedAt: null });
    // The new season is current, holding only the carried goals, linked back to last season's rows.
    expect((await page()).season?.goals).toEqual([
      { id: "sg-season-2-alice-fit", goalId: "alice-fit", title: "Become fit", archived: false, tier: "secondary", target: "Run a half marathon", carriedFromId: "sg-alice-fit" },
      { id: "sg-season-2-alice-sleep", goalId: "alice-sleep", title: "Sleep 8h", archived: false, tier: "primary", target: "Sleep 8h", carriedFromId: "sg-alice-sleep" },
    ]);
    // The ended season keeps every goal, tier and target as they were.
    expect((await past()).seasons).toEqual([expect.objectContaining({ id: "season-1", endedAt: "2026-03-26T08:00:00.000Z", goals: [
      expect.objectContaining({ goalId: "alice-fit", tier: "primary", target: "Run a 10k", carriedFromId: null }),
      expect.objectContaining({ goalId: "alice-v2", tier: "primary", target: "Beta to 10 users" }),
      expect.objectContaining({ goalId: "alice-sleep", tier: "secondary", target: "Sleep 7h" }),
    ] })]);
    // Ended seasons are read-only.
    expect((await call("PATCH", "/seasons/season-1/goals/alice-v2", { user: "alice", body: { target: "x" } })).status).toBe(404);
    expect((await addGoal("alice-muscle", "primary", "x")).status).toBe(404);
    expect((await end({ next: null })).status).toBe(404);
  });

  it("ends a season without starting another, then a new one can start", async () => {
    await start();
    await addGoal("alice-fit", "primary", "Run a 10k");
    expect(await (await end({ next: null })).json()).toMatchObject({ ended: { id: "season-1", goals: [{ goalId: "alice-fit" }] }, next: null });
    expect(await page()).toEqual({ season: null });
    expect((await start("alice", { startDate: "2026-04-01", lengthDays: 28 })).status).toBe(201);
  });

  it("lists past seasons newest first, per user", async () => {
    await start("alice", { startDate: "2026-01-01", lengthDays: 28 });
    await end({ next: { startDate: "2026-01-29", lengthDays: 28, goals: [] } });
    await end({ next: null }, "season-2");
    expect((await past()).seasons.map(season => season.id)).toEqual(["season-2", "season-1"]);
    expect((await past("bob")).seasons.map(season => season.id)).toEqual(["bob-old"]);
    expect((await call("GET", "/seasons/past", { user: "alice" })).headers.get("cache-control")).toBe("no-store");
  });

  it("refuses the whole end when a carried goal is not in the season, is archived, or the season is not the caller's current one", async () => {
    await start();
    await addGoal("alice-fit", "primary", "Run a 10k");
    const next = (goals: unknown[]) => ({ next: { startDate: "2026-03-26", lengthDays: 28, goals } });
    for (const goalId of ["alice-v2", "bob-read", "nope"]) {
      expect((await end(next([{ goalId, tier: "primary", target: "x" }]))).status, goalId).toBe(404);
    }
    expect((await end(next([]), "season-1", "bob")).status).toBe(404);
    expect((await end(next([]), "bob-old", "bob")).status).toBe(404);
    for (const body of [{}, { next: { startDate: "2026-02-30", lengthDays: 28, goals: [] } }, { next: { startDate: "2026-03-26", lengthDays: 28 } },
      next([{ goalId: "alice-fit", tier: "primary", target: " " }]), next([{ goalId: "alice-fit", tier: "main", target: "x" }]),
      next([{ goalId: "alice-fit", tier: "primary", target: "x" }, { goalId: "alice-fit", tier: "secondary", target: "y" }]),
      next([{ goalId: "alice-fit", tier: "primary", target: "x", carriedFromId: "sg-x" }]), { next: null, userId: "bob" }]) {
      expect((await end(body)).status, JSON.stringify(body)).toBe(400);
    }
    // Nothing was written: the same season is still current with its goal.
    expect((await page()).season).toMatchObject({ id: "season-1", goals: [{ goalId: "alice-fit", target: "Run a 10k" }] });
    expect(seasons.filter(season => season.userId === "alice")).toHaveLength(1);
    expect((await call("POST", "/seasons/season-1/end", { cookie: "alice", origin: "https://evil.example", body: { next: null } })).status).toBe(403);
  });

  it("refuses carrying a goal archived during the season", async () => {
    await start();
    await addGoal("alice-fit", "primary", "Run a 10k");
    rows.push({ id: "sg-alice-old", userId: "alice", seasonId: "season-1", goalId: "alice-old", tier: "secondary", target: "Old", carriedFromId: null });
    expect((await end({ next: { startDate: "2026-03-26", lengthDays: 28, goals: [{ goalId: "alice-old", tier: "primary", target: "x" }] } })).status).toBe(404);
    expect((await page()).season?.id).toBe("season-1");
  });
});
