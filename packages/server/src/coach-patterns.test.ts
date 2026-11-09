import { describe, expect, it } from "vitest";
import { CoachModelError, type CoachMessage } from "./coach";
import { LEARN_LIMIT, MIN_SIGNALS, learnFacts, parseLearned, patternSource, withPatterns } from "./coach-patterns";
import type { StatusInputs } from "./goal-status";

const sys = (content: string): CoachMessage => ({ role: "system", content });
const user = (content: string): CoachMessage => ({ role: "user", content });

describe("withPatterns", () => {
  it.each([
    { name: "no patterns: unchanged", messages: [sys("a"), user("u")], patterns: [], roles: ["system", "user"], at: -1 },
    { name: "after the system prompt", messages: [sys("a"), user("u")], patterns: ["Ships best in the mornings"], roles: ["system", "system", "user"], at: 1 },
    { name: "after every leading system message (chat facts)", messages: [sys("a"), sys("facts"), user("h"), user("u")], patterns: ["x"], roles: ["system", "system", "system", "user", "user"], at: 2 },
    { name: "only system messages: at the end", messages: [sys("a")], patterns: ["x"], roles: ["system", "system"], at: 1 },
  ])("$name", ({ messages, patterns, roles, at }) => {
    const out = withPatterns(messages, patterns.map(statement => ({ statement })));
    expect(out.map(message => message.role)).toEqual(roles);
    if (at >= 0) for (const statement of patterns) expect(out[at]!.content).toContain(`- ${statement}`);
  });
});

describe("parseLearned", () => {
  const reply = (patterns: { statement: string; evidence: string }[]) => JSON.stringify({ patterns });
  it.each([
    { name: "keeps new ones with evidence", content: reply([{ statement: "Ships best in the mornings", evidence: "9 of 12 before noon." }]), known: [], room: 20, out: ["Ships best in the mornings"] },
    { name: "drops known ones, ignoring case and punctuation", content: reply([{ statement: "ships best in the mornings!", evidence: "e" }, { statement: "Admin is draining", evidence: "e" }]), known: ["Ships best in the mornings"], room: 20, out: ["Admin is draining"] },
    { name: "drops one without evidence or a statement", content: reply([{ statement: "A", evidence: " " }, { statement: " ", evidence: "e" }]), known: [], room: 20, out: [] },
    { name: "drops repeats in one reply", content: reply([{ statement: "A b", evidence: "e" }, { statement: "a  B", evidence: "e" }]), known: [], room: 20, out: ["A b"] },
    { name: "at most LEARN_LIMIT", content: reply(["a", "b", "c", "d", "e"].map(statement => ({ statement, evidence: "e" }))), known: [], room: 20, out: ["a", "b", "c"].slice(0, LEARN_LIMIT) },
    { name: "at most the room left", content: reply(["a", "b", "c"].map(statement => ({ statement, evidence: "e" }))), known: [], room: 1, out: ["a"] },
  ])("$name", ({ content, known, room, out }) => {
    expect(parseLearned(content, known, room).map(item => item.statement)).toEqual(out);
  });

  it.each(["not json", JSON.stringify({ patterns: "x" }), JSON.stringify({})])("refuses %s", (content) => {
    expect(() => parseLearned(content, [], 20)).toThrow(CoachModelError);
  });
});

describe("learnFacts", () => {
  // Season from Mon 2 Feb 2026; now Wed 18 Feb 12:00 UTC.
  const now = new Date("2026-02-18T12:00:00Z");
  const task = (id: string, due: string, status: "done" | "todo", completed?: string) =>
    ({ id, projectId: null, status, dueDate: new Date(due), dueDateEnd: new Date(new Date(due).getTime() + 3_600_000), completedAt: completed ? new Date(completed) : null });
  const inputs = (tasks: ReturnType<typeof task>[], ratings = 0): StatusInputs => ({
    links: { projects: [], tasks: tasks.map(item => ({ goalId: "fit", taskId: item.id })) }, tasks,
    ratings: Array.from({ length: ratings }, (_, index) => ({ goalId: "fit", day: `2026-02-0${index + 2}`, rating: "solid" as const })),
    milestones: [], reviewed: true,
  });
  const facts = (given: StatusInputs) => learnFacts({
    startDate: "2026-02-02", today: "2026-02-18", zone: "UTC", now, goals: [{ goalId: "fit", title: "Become fit", tier: "primary" }],
    weeks: new Map([["fit", [{ ratings: [], completed: 2, scheduledMinutes: 120, keptMinutes: 60, milestones: 0, elapsed: 1 }]]]), inputs: given, moves: [], known: ["Old one"],
  });

  it("is null with fewer than MIN_SIGNALS data points", () => {
    expect(MIN_SIGNALS).toBeGreaterThan(2);
    expect(facts(inputs([task("a", "2026-02-03T08:00:00Z", "done", "2026-02-03T09:00:00Z")]))).toBeNull();
  });

  it("counts scheduled time kept by part of day, when tasks got done, and the known patterns", () => {
    const result = facts(inputs([
      task("a", "2026-02-03T08:00:00Z", "done", "2026-02-03T09:00:00Z"),
      task("b", "2026-02-04T09:00:00Z", "done", "2026-02-04T10:00:00Z"),
      task("c", "2026-02-05T14:00:00Z", "todo"),
      task("later", "2026-02-25T14:00:00Z", "todo"),
    ], 1))!;
    expect(result.seasonWeek).toBe(3);
    expect(result.known).toEqual(["Old one"]);
    const [goal] = result.goals;
    expect(goal!.keptByPartOfDay).toEqual([
      { partOfDay: "morning", minutesScheduled: 120, minutesKept: 120 },
      { partOfDay: "afternoon", minutesScheduled: 60, minutesKept: 0 },
    ]);
    expect(goal!.doneAt).toEqual([{ partOfDay: "morning", tasks: 2 }]);
    expect(goal!.weeks[0]).toMatchObject({ week: 1, goalTasksCompleted: 2, minutesKept: 60, tasksMoved: 0 });
  });
});

describe("patternSource", () => {
  it.each([
    ["2026-02-02", "2026-02-04", "Season from 2 Feb, week 1"],
    ["2026-02-02", "2026-02-18", "Season from 2 Feb, weeks 1–3"],
  ])("%s to %s", (start, today, prefix) => expect(patternSource(start, today)).toMatch(new RegExp(`^${prefix}:`)));
});
