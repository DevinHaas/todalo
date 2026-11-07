import { describe, expect, it } from "vitest";
import { hasTimeIn, summariseWeek, taskMinutes, type WeekTask } from "./weekly-review";

const zone = "Europe/Zurich";
// The week of Monday 2026-03-09 in Zurich (UTC+1).
const from = new Date("2026-03-08T23:00:00Z");
const to = new Date("2026-03-15T23:00:00Z");
const at = (iso: string) => new Date(iso);
const task = (id: string, patch: Partial<WeekTask> = {}): WeekTask =>
  ({ id, projectId: null, status: "todo", dueDate: null, dueDateEnd: null, completedAt: null, ...patch });
const links = { projects: [{ goalId: "v2", projectId: "p-v2" }], tasks: [{ goalId: "fit", taskId: "run" }, { goalId: "fit", taskId: "gym" }, { goalId: "fit", taskId: "old" }] };

describe("task minutes", () => {
  it.each([
    ["its own range", "2026-03-10T08:00:00Z", "2026-03-10T09:30:00Z", 90],
    ["no end: 30 minutes", "2026-03-10T08:00:00Z", null, 30],
    ["shorter than a slot: 30 minutes", "2026-03-10T08:00:00Z", "2026-03-10T08:05:00Z", 30],
    ["longer than a day: 30 minutes", "2026-03-10T08:00:00Z", "2026-03-12T08:00:00Z", 30],
  ])("%s", (_name, start, end, minutes) => expect(taskMinutes({ dueDate: at(start), dueDateEnd: end ? at(end) : null })).toBe(minutes));

  it.each([["2026-03-09T23:00:00Z", false], ["2026-03-10T07:00:00Z", true], ["2026-03-10T00:00:00Z", true]])("%s has a time of day in Zurich: %s",
    (iso, timed) => expect(hasTimeIn(at(iso), zone)).toBe(timed));
});

describe("week summary", () => {
  it("counts goal-linked tasks completed, minutes scheduled and minutes kept, per goal", () => {
    const tasks = [
      // fit: a kept 60-minute run, a missed 30-minute gym session, a task done last week.
      task("run", { status: "done", dueDate: at("2026-03-10T06:00:00Z"), dueDateEnd: at("2026-03-10T07:00:00Z"), completedAt: at("2026-03-10T07:05:00Z") }),
      task("gym", { dueDate: at("2026-03-11T17:00:00Z") }),
      task("old", { status: "done", completedAt: at("2026-03-08T12:00:00Z") }),
      // v2 through its project: done without a time (counts as completed only) and an all-day task (no minutes).
      task("spec", { projectId: "p-v2", status: "done", dueDate: at("2026-03-11T23:00:00Z"), completedAt: at("2026-03-12T10:00:00Z") }),
      task("allday", { projectId: "p-v2", dueDate: at("2026-03-12T23:00:00Z") }),
      // Not linked, and scheduled next week.
      task("loose", { status: "done", dueDate: at("2026-03-10T08:00:00Z"), completedAt: at("2026-03-10T09:00:00Z") }),
      task("later", { projectId: "p-v2", dueDate: at("2026-03-16T08:00:00Z") }),
    ];
    const checkIns = [{ goalId: "fit", day: "2026-03-11", rating: "solid" as const }, { goalId: "fit", day: "2026-03-09", rating: "mixed" as const }];
    expect(summariseWeek({ goalIds: ["fit", "v2", "empty"], links, tasks, checkIns, from, to, zone })).toEqual([
      { goalId: "fit", checkIns: [{ day: "2026-03-09", rating: "mixed" }, { day: "2026-03-11", rating: "solid" }], completed: 1, scheduledMinutes: 90, keptMinutes: 60 },
      { goalId: "v2", checkIns: [], completed: 1, scheduledMinutes: 0, keptMinutes: 0 },
      { goalId: "empty", checkIns: [], completed: 0, scheduledMinutes: 0, keptMinutes: 0 },
    ]);
  });
});
