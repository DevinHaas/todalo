import { describe, expect, it } from "vitest";
import type { ExplanationFacts } from "./coach";
import { dismissedThisWeek, parseRecommendation, recommendationFacts, recommendationWeek, seasonWeekOf } from "./coach-recommendations";

const explanation = (status: string): ExplanationFacts => ({
  goal: "Ship v2", tier: "primary", target: "Launch", seasonDay: 40, seasonLength: 84, status, score: 30, projectedAtSeasonEnd: 25,
  weeks: [5, 6].map(week => ({ week, inProgress: week === 6, weekElapsed: 100, score: 30, goalTasksCompleted: 1, minutesScheduled: 60, minutesKept: 30, progressRatings: [], milestonesReached: 0 })),
});
const links = { projects: [{ goalId: "ship", projectId: "p" }], tasks: [{ goalId: "ship", taskId: "loose" }] };
const now = new Date("2026-03-12T10:00:00Z"); // Thursday of season week 6 (season from Sunday 1 Feb)
const move = (taskId: string, projectId: string | null, from: string, at: string) => ({ taskId, projectId, fromDate: new Date(from), movedAt: new Date(at) });
const facts = (status: string, moves: ReturnType<typeof move>[] = [], tasks: Parameters<typeof recommendationFacts>[0]["tasks"] = []) =>
  recommendationFacts({ explanation: explanation(status), goalId: "ship", startDate: "2026-02-01", zone: "UTC", now, links, tasks, moves });

describe("recommendationFacts", () => {
  it.each([["On track", null], ["Adjust", "object"], ["Off track", "object"]])("%s → %s", (status, kind) => {
    expect(facts(status) === null ? null : typeof facts(status)).toBe(kind);
  });

  it("is null while Too early (no explanation facts)", () => {
    expect(recommendationFacts({ explanation: null, goalId: "ship", startDate: "2026-02-01", zone: "UTC", now, links, tasks: [], moves: [] })).toBeNull();
  });

  it("counts the goal's own moves per week and where they were moved from", () => {
    const result = facts("Off track", [
      move("t1", "p", "2026-03-05T14:00:00Z", "2026-03-05T16:00:00Z"), // week 5, Thursday afternoon
      move("loose", null, "2026-03-12T15:00:00Z", "2026-03-12T09:00:00Z"), // week 6, Thursday afternoon
      move("t2", "p", "2026-03-10T00:00:00Z", "2026-03-10T09:00:00Z"), // week 6, a whole-day date
      move("other", "q", "2026-03-05T14:00:00Z", "2026-03-05T16:00:00Z"), // another goal's
    ])!;
    expect(result.weeks.map(week => [week.week, week.tasksMoved])).toEqual([[5, 1], [6, 2]]);
    expect(result.movedFrom).toEqual([
      { weekday: "Thursday", partOfDay: "afternoon", times: 2, sinceWeek: 5 },
      { weekday: "Tuesday", partOfDay: "any time", times: 1, sinceWeek: 6 },
    ]);
  });

  it("reads when goal tasks get done and what is scheduled in the next seven days", () => {
    const task = (id: string, extra: object) => ({ id, projectId: "p", status: "todo" as const, dueDate: null, dueDateEnd: null, completedAt: null, ...extra });
    const result = facts("Adjust", [], [
      task("a", { status: "done", completedAt: new Date("2026-03-02T08:00:00Z") }),
      task("b", { status: "done", completedAt: new Date("2026-03-03T19:00:00Z") }),
      task("c", { status: "done", completedAt: new Date("2026-03-04T09:30:00Z") }),
      task("d", { dueDate: new Date("2026-03-13T09:00:00Z"), dueDateEnd: new Date("2026-03-13T10:30:00Z") }),
      task("e", { dueDate: new Date("2026-03-14T00:00:00Z") }), // all day: not scheduled
      task("f", { dueDate: new Date("2026-03-25T09:00:00Z") }), // beyond seven days
    ])!;
    expect(result.doneAt).toEqual([{ partOfDay: "morning", tasks: 2 }, { partOfDay: "evening", tasks: 1 }]);
    expect(result.nextSevenDays).toEqual({ tasksScheduled: 1, minutesScheduled: 90 });
  });
});

describe("season weeks, dismissal and the draft's week", () => {
  it.each([["2026-02-01", 1], ["2026-02-07", 1], ["2026-02-08", 2], ["2026-03-12", 6]])("%s is season week %i", (day, week) => {
    expect(seasonWeekOf("2026-02-01", day)).toBe(week);
  });
  it.each([
    [null, "2026-02-10", false],
    ["2026-02-08T10:00:00Z", "2026-02-14", true],
    ["2026-02-08T10:00:00Z", "2026-02-15", false],
    ["2026-02-07T23:30:00Z", "2026-02-08", false],
  ])("dismissed %s, today %s → hidden %s", (at, today, hidden) => {
    expect(dismissedThisWeek(at ? new Date(at) : null, { startDate: "2026-02-01", today, zone: "UTC" })).toBe(hidden);
  });
  it.each([["2026-02-09", "2026-02-09"], ["2026-02-12", "2026-02-09"], ["2026-02-13", "2026-02-16"], ["2026-02-15", "2026-02-16"]])("today %s drafts the week of %s", (today, start) => {
    expect(recommendationWeek(today)).toBe(start);
  });
});

describe("parseRecommendation", () => {
  it.each([
    ['{"recommendation":"  Move it\\n to mornings. "}', "Move it to mornings."],
    [JSON.stringify({ recommendation: "x".repeat(500) }), `${"x".repeat(399)}…`],
  ])("reads %s", (content, text) => expect(parseRecommendation(content)).toBe(text));
  it.each(["not json", '{"recommendation":" "}', '{"other":"x"}'])("rejects %s", (content) => {
    expect(() => parseRecommendation(content)).toThrow();
  });
});
