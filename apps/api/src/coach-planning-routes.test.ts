import { beforeEach, describe, expect, it } from "vitest";
import { CoachModelError, type CoachConfig, type CoachMessage } from "@todalo/server/coach";
import type { PlanningDto } from "@todalo/server/coach-planning";
import type { DraftRecord, DraftTask, NewDraft } from "@todalo/server/drafts";
import { createCoachPlanningRoutes } from "./coach-planning-routes";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
let clock: Date;
const v1 = new Date("2026-02-01T00:00:00Z");
let providers: Map<string, CoachConfig>;
let tasks: (DraftTask & { userId: string })[];
let drafts: (NewDraft & { id: string; userId: string })[];
let calls: { messages: CoachMessage[]; schema?: string }[];
/** The fake model's replies by schema name. */
let replies: Record<string, () => string>;

const task = (userId: string, id: string, extra: Partial<DraftTask> = {}) =>
  tasks.push({ userId, id, title: id, status: "todo", projectId: null, parentId: null, dueDate: null, dueDateEnd: null, updatedAt: v1, ...extra });
const ask = (question: string, options: string[]) => () => JSON.stringify({ done: false, question, options });
const plan = (value: object = {}) => () => JSON.stringify({
  summary: "Start with a coach and a first run.",
  tasks: [{ title: "Book a running coach", day: "2026-02-10", start: "07:00", minutes: 30, reason: "Gets you started." }],
  milestones: [{ title: "Run 5k", day: "2026-03-01", criteria: ["Under 30 minutes"], reason: "Halfway there." }],
  ...value,
});

beforeEach(() => {
  clock = new Date("2026-02-09T08:10:00Z");
  providers = new Map([["alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: "sk-or-test" }]]);
  tasks = [];
  drafts = [];
  calls = [];
  task("alice", "shoes-id", { title: "Buy running shoes" });
  task("alice", "base-id", { title: "Base fitness test", dueDate: new Date("2026-02-14T23:00:00Z") });
  task("alice", "meeting-id", { title: "Meeting", dueDate: new Date("2026-02-09T09:00:00Z"), dueDateEnd: new Date("2026-02-09T10:00:00Z") });
  task("bob", "bobs-id", { title: "Bob's task" });
  replies = { planning_question: ask("When can you run?", ["Mornings", "Evenings"]), planning_draft: plan() };
});

const snapshot = () => JSON.stringify(tasks);

const app = createCoachPlanningRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  provider: async (userId) => providers.get(userId) ?? null,
  // In-memory fake provider; it never reaches a network.
  model: (config) => ({
    complete: async ({ messages, schema }) => {
      calls.push({ messages, schema: schema?.name });
      if (config.model === "broken") throw new CoachModelError("The provider is unavailable. Try again later.");
      return replies[schema!.name]!();
    },
  }),
  dayContext: async (userId) => ({
    tasks: tasks.filter(row => row.userId === userId),
    goals: userId === "alice" ? [{ goalId: "fit", title: "Become fit", tier: "primary" }] : [],
    links: { projects: [], tasks: userId === "alice" ? [{ goalId: "fit", taskId: "shoes-id" }, { goalId: "fit", taskId: "base-id" }] : [] },
    fixedTaskIds: [],
  }),
  goal: async (userId, goalId) => userId === "alice" && goalId === "fit" ? { id: "fit", title: "Become fit", description: "Feel strong again", archivedAt: null }
    : userId === "alice" && goalId === "old" ? { id: "old", title: "Old", description: null, archivedAt: v1 } : null,
  season: async (userId) => userId === "alice" ? {
    season: { id: "s1", startDate: "2026-02-02", lengthDays: 84, endedAt: null },
    goals: [{ id: "sg1", goalId: "fit", title: "Become fit", color: "green", archivedAt: null, tier: "primary", target: "Run 5k under 30 minutes", carriedFromId: null }],
  } : null,
  patterns: async (userId) => userId === "alice" ? [{ id: "p1", statement: "Runs best before work", evidence: "", source: "", learnedAt: v1, editedAt: null }] : [],
  milestones: async (userId, goalId) => userId === "alice" && goalId === "fit" ? [{ taskId: "base-id" }] : [],
  saveDraft: async (userId, draft) => {
    const id = `d${drafts.length + 1}`;
    drafts.push({ ...draft, id, userId });
    return { ...draft, id, createdAt: clock, items: draft.items.map((row, index) => ({ ...row, id: `${id}-i${index + 1}`, state: "pending" as const })) } satisfies DraftRecord;
  },
  now: () => clock,
});

const call = (body: unknown, init: { user?: string; cookie?: string; origin?: string } = { user: "alice" }) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.user) headers.set("authorization", `Bearer ${init.user}`);
  if (init.cookie) headers.set("cookie", `session=${init.cookie}`);
  if (init.origin) headers.set("origin", init.origin);
  return app.handle(new Request(`http://localhost/api/v1/coach/planning?timeZone=${zone}`, { method: "POST", headers, body: JSON.stringify(body) }));
};
const input = (extra: object = {}) => ({ goalId: "fit", source: "goal", ramble: "I want to get fit but never find time.", turns: [], ...extra });
const turn = async (body: object) => await (await call(body)).json() as PlanningDto;

describe("a planning session", () => {
  it("asks a multiple-choice question with its step, from the goal's facts and what the user said", async () => {
    const result = await turn(input());
    expect(result).toEqual({ question: { text: "When can you run?", options: ["Mornings", "Evenings"], step: 1, total: 5 }, draft: null });
    expect(calls.map(row => row.schema)).toEqual(["planning_question"]);
    const [, facts, , said] = calls[0]!.messages;
    expect(facts!.content).toContain("Run 5k under 30 minutes");
    expect(facts!.content).toContain("Buy running shoes");
    expect(facts!.content).toContain("\"milestones\":[{\"title\":\"Base fitness test\",\"due\":\"2026-02-15\"}]");
    expect(facts!.content).toContain("Meeting");
    expect(facts!.content).not.toContain("Bob's task");
    expect(facts!.content).not.toContain("shoes-id");
    expect(said).toEqual({ role: "user", content: "I want to get fit but never find time." });
    expect(drafts).toEqual([]);
  });

  it("puts the user's stored patterns into both prompts, after the facts", async () => {
    await turn(input());
    await turn(input({ finish: true }));
    for (const { messages } of calls) expect(messages[2]).toMatchObject({ role: "system", content: expect.stringContaining("- Runs best before work") });
  });

  it("sends each answered question back as turns, the step counting up", async () => {
    const result = await turn(input({ turns: [{ question: "When can you run?", answer: "Mornings" }] }));
    expect(result.question?.step).toBe(2);
    expect(calls[0]!.messages.slice(3).map(row => [row.role, row.content])).toEqual([
      ["user", "I want to get fit but never find time."], ["assistant", "When can you run?"], ["user", "Mornings"],
    ]);
  });

  it("ends in a plan draft of new timed tasks and milestones for the goal, touching no task", async () => {
    const before = snapshot();
    replies.planning_question = () => JSON.stringify({ done: true, question: "", options: [] });
    const result = await turn(input({ source: "season" }));
    expect(calls.map(row => row.schema)).toEqual(["planning_question", "planning_draft"]);
    expect(calls[1]!.messages[1]!.content).toContain("setting up their season");
    expect(result.question).toBeNull();
    expect(result.draft).toMatchObject({ kind: "plan", period: "2026-02-09", summary: "Start with a coach and a first run." });
    expect(result.draft!.items.map(row => [row.op, row.taskId, row.title, row.start, row.end, row.goalId, row.criteria])).toEqual([
      ["add", null, "Book a running coach", "2026-02-10T06:00:00.000Z", "2026-02-10T06:30:00.000Z", "fit", undefined],
      ["add", null, "Run 5k", "2026-02-28T23:00:00.000Z", null, "fit", ["Under 30 minutes"]],
    ]);
    expect(drafts).toHaveLength(1);
    expect(snapshot()).toBe(before);
  });

  it("drafts at once when the user finishes early or the questions run out", async () => {
    expect((await turn(input({ finish: true }))).draft?.kind).toBe("plan");
    const answered = Array.from({ length: 5 }, (_, index) => ({ question: `Q${index}`, answer: "A" }));
    expect((await turn(input({ turns: answered }))).draft?.kind).toBe("plan");
    expect(calls.map(row => row.schema)).toEqual(["planning_draft", "planning_draft"]);
  });

  it("saves nothing and says why when the plan does not fit", async () => {
    replies.planning_draft = plan({ tasks: [{ title: "Clash", day: "2026-02-09", start: "10:15", minutes: 30, reason: "" }] }); // over the meeting
    const result = await turn(input({ finish: true }));
    expect(result).toMatchObject({ question: null, draft: null });
    expect(result.message).toContain("overlap");
    replies.planning_draft = plan({ milestones: [{ title: "Late", day: "2026-05-01", criteria: ["x"], reason: "" }] }); // after the season
    expect((await turn(input({ finish: true }))).message).toContain("milestone day");
    replies.planning_draft = plan({ tasks: [], milestones: [], summary: "" });
    expect((await turn(input({ finish: true }))).message).toContain("nothing to add");
    replies.planning_question = ask("Pick one", ["Only"]);
    expect((await turn(input())).message).toContain("without answers");
    expect(drafts).toEqual([]);
  });

  it("says why when the model fails, and asks for the key again when it no longer decrypts", async () => {
    providers.set("alice", { provider: "openrouter", model: "broken", baseUrl: null, apiKey: "sk-or-test" });
    expect(await turn(input())).toEqual({ question: null, draft: null, message: "The provider is unavailable. Try again later." });
    providers.set("alice", { provider: "openrouter", model: "m", baseUrl: null, apiKey: null });
    expect((await turn(input())).message).toContain("API key");
    expect(calls).toHaveLength(1);
  });
});

describe("planning access", () => {
  it("needs a provider, a session, a todalo origin, a live goal of the user's and a valid transcript", async () => {
    expect((await call(input(), { user: "bob" })).status).toBe(404);
    expect((await call(input(), { origin: "http://localhost:5173" })).status).toBe(401);
    expect((await call(input(), { cookie: "alice", origin: "https://evil.example" })).status).toBe(403);
    expect((await call(input({ goalId: "bobs-goal" }))).status).toBe(404);
    expect((await call(input({ goalId: "old" }))).status).toBe(404);
    expect((await call(input({ ramble: " " }))).status).toBe(400);
    expect((await call(input({ source: "elsewhere" }))).status).toBe(400);
    expect((await call(input({ userId: "bob" }))).status).toBe(400);
    expect((await call(input({ turns: Array.from({ length: 6 }, () => ({ question: "Q", answer: "A" })) }))).status).toBe(400);
    expect((await call(input(), { cookie: "alice", origin: "http://localhost:5173" })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});
