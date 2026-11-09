import { describe, expect, it } from "vitest";
import { CoachModelError } from "./coach";
import { milestoneLastDay, parsePlanningDraft, parsePlanningQuestion, planningFacts, planningMessages, PLANNING_QUESTION_PROMPT } from "./coach-planning";
import { planAccept, weekPlan, type DayContext, type DraftRecord } from "./drafts";

// Zurich, Monday 9 Feb 2026, 09:10 local.
const zone = "Europe/Zurich";
const now = new Date("2026-02-09T08:10:00Z");
const context: DayContext = {
  tasks: [{ id: "meeting", title: "Meeting", status: "todo", projectId: null, parentId: null, dueDate: new Date("2026-02-09T09:00:00Z"), dueDateEnd: new Date("2026-02-09T10:00:00Z"), updatedAt: now }],
  goals: [{ goalId: "fit", title: "Become fit", tier: "primary" }, { goalId: "read", title: "Read more", tier: "secondary" }],
  links: { projects: [], tasks: [] },
  fixedTaskIds: [],
};
const plan = weekPlan({ context, zone, now, start: "2026-02-09" });
const lastDay = "2026-04-26";
const question = (value: object) => JSON.stringify({ done: false, question: "When do you have time?", options: [], ...value });
const draft = (value: object) => JSON.stringify({ summary: "A plan.", tasks: [], milestones: [], ...value });
const task = (extra: object = {}) => ({ title: "Book a running coach", day: "2026-02-10", start: "07:00", minutes: 30, reason: "Starts the habit.", ...extra });
const milestone = (extra: object = {}) => ({ title: "Run 5k", day: "2026-03-01", criteria: ["Under 30 minutes"], reason: "Halfway.", ...extra });

describe("parsePlanningQuestion", () => {
  it.each([
    ["two options", question({ options: ["Mornings", "Evenings"] }), { text: "When do you have time?", options: ["Mornings", "Evenings"] }],
    ["drops the model's own catch-alls and duplicates", question({ options: ["Mornings", "mornings", "Other", "Something else…", "Weekends"] }), { text: "When do you have time?", options: ["Mornings", "Weekends"] }],
    ["at most four options", question({ options: ["a", "b", "c", "d", "e"] }), { text: "When do you have time?", options: ["a", "b", "c", "d"] }],
    ["done drafts", JSON.stringify({ done: true, question: "", options: [] }), "done"],
  ])("%s", (_, content, expected) => {
    expect(parsePlanningQuestion(content)).toEqual(expected);
  });

  it.each([
    ["not JSON", "nope"],
    ["fewer than two options", question({ options: ["Mornings", "Other"] })],
    ["no question", question({ question: " ", options: ["a", "b"] })],
    ["wrong shape", JSON.stringify({ question: "Hi" })],
  ])("rejects %s", (_, content) => {
    expect(() => parsePlanningQuestion(content)).toThrow(CoachModelError);
  });
});

describe("parsePlanningDraft", () => {
  it("turns tasks into timed adds and milestones into dated adds with criteria, all for the goal", () => {
    const result = parsePlanningDraft(draft({ tasks: [task()], milestones: [milestone({ criteria: [" Under 30 minutes ", "", "Without stopping"] })] }), plan, "fit", lastDay);
    expect(result.summary).toBe("A plan.");
    expect(result.items).toEqual([
      expect.objectContaining({ op: "add", taskId: null, title: "Book a running coach", goalId: "fit", startAt: new Date("2026-02-10T06:00:00Z"), endAt: new Date("2026-02-10T06:30:00Z") }),
      expect.objectContaining({ op: "add", taskId: null, title: "Run 5k", goalId: "fit", startAt: new Date("2026-02-28T23:00:00Z"), endAt: null, criteria: ["Under 30 minutes", "Without stopping"] }),
    ]);
    expect(result.items[0]).not.toHaveProperty("criteria");
  });

  it.each([
    ["a task overlapping the schedule", { tasks: [task({ day: "2026-02-09", start: "10:15" })] }],
    ["a task after the listed days", { tasks: [task({ day: "2026-02-16" })] }],
    ["a task already past", { tasks: [task({ day: "2026-02-09", start: "07:00" })] }],
    ["two tasks overlapping", { tasks: [task(), task({ title: "Stretch", start: "07:15" })] }],
    ["a milestone before today", { milestones: [milestone({ day: "2026-02-08" })] }],
    ["a milestone after the last day", { milestones: [milestone({ day: "2026-04-27" })] }],
    ["an impossible day", { milestones: [milestone({ day: "2026-02-30" })] }],
    ["a milestone without criteria", { milestones: [milestone({ criteria: [" "] })] }],
    ["too many criteria", { milestones: [milestone({ criteria: ["a", "b", "c", "d", "e", "f"] })] }],
    ["too many milestones", { milestones: Array.from({ length: 6 }, (_, index) => milestone({ title: `M${index}` })) }],
    ["a milestone without a title", { milestones: [milestone({ title: "" })] }],
  ])("rejects the whole draft for %s", (_, value) => {
    expect(() => parsePlanningDraft(draft(value), plan, "fit", lastDay)).toThrow(CoachModelError);
  });
});

describe("milestoneLastDay", () => {
  it.each([
    ["the season's last day", { startDate: "2026-02-02", lengthDays: 84 }, "2026-04-26"],
    ["12 weeks ahead without a season", null, "2026-05-03"],
    ["12 weeks ahead once the season is over", { startDate: "2025-10-01", lengthDays: 28 }, "2026-05-03"],
  ])("%s", (_, season, expected) => {
    expect(milestoneLastDay("2026-02-09", season)).toBe(expected);
  });
});

describe("planning facts and messages", () => {
  it("names the goal, the other primary goals and the busy schedule, without IDs", () => {
    const facts = planningFacts(plan, { goalId: "read", title: "Read more", description: null, season: { tier: "secondary", target: "12 books" }, openTasks: ["Buy a book"], milestones: [] }, "review", lastDay);
    expect(facts.goal).toMatchObject({ title: "Read more", tier: "secondary", target: "12 books", openTasks: ["Buy a book"] });
    expect(facts.otherPrimaryGoals).toEqual(["Become fit"]);
    expect(facts.busy).toEqual([{ title: "Meeting", day: "2026-02-09", start: "10:00", minutes: 60 }]);
    expect(JSON.stringify(facts)).not.toContain("meeting\"");
    const messages = planningMessages(PLANNING_QUESTION_PROMPT, facts, { ramble: "I want to read again", turns: [{ question: "When?", answer: "Evenings" }] });
    expect(messages.map(message => [message.role, message.content])).toEqual([
      ["system", PLANNING_QUESTION_PROMPT], ["system", expect.stringContaining("Weekly review")], ["user", "I want to read again"], ["assistant", "When?"], ["user", "Evenings"],
    ]);
  });
});

describe("accepting a drafted milestone", () => {
  it("carries its criteria into the write", () => {
    const record: DraftRecord = { id: "d1", kind: "plan", period: "2026-02-09", summary: "", createdAt: now, items: [
      { id: "i1", op: "add", taskId: null, title: "Run 5k", startAt: new Date("2026-02-28T23:00:00Z"), endAt: null, goalId: "fit", reason: "", seenUpdatedAt: null, state: "pending", criteria: ["Under 30 minutes"] },
    ] };
    expect(planAccept(record, undefined, [])).toEqual([{ itemId: "i1", taskId: null, title: "Run 5k", goalId: "fit", dueDate: new Date("2026-02-28T23:00:00Z"), dueDateEnd: null, criteria: ["Under 30 minutes"] }]);
  });
});
