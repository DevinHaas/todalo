import { describe, expect, it } from "vitest";
import { bandOf, goalStatus, seasonStatuses, statusRules, weekScore, type StatusInputs, type WeekSignals } from "./goal-status";
import type { WeekTask } from "./weekly-review";

const week = (patch: Partial<WeekSignals> = {}): WeekSignals => ({ ratings: [], completed: 0, scheduledMinutes: 0, keptMinutes: 0, milestones: 0, elapsed: 1, ...patch });

describe("week score", () => {
  it.each([
    ["an empty week", week(), 0],
    ["three tasks done, nothing else", week({ completed: 3 }), 1],
    ["more tasks than a full week caps at 1", week({ completed: 9 }), 1],
    // (0.3 × 0 + 0.4 × 1) / 0.7
    ["a Massive rating without work", week({ ratings: ["massive"] }), 0.57],
    ["Not relevant ratings are left out", week({ ratings: ["not_relevant"], completed: 3 }), 1],
    // (0.3 × 1/3 + 0.4 × (0.75 + 0.2) / 2 + 0.3 × 30/60) / 1.0
    ["one task, Solid and Little, half the scheduled time kept", week({ completed: 1, ratings: ["solid", "little"], scheduledMinutes: 60, keptMinutes: 30 }), 0.44],
    // (0.3 × 2/3 + 0.2 × 1) / 0.5
    ["a reached milestone", week({ completed: 2, milestones: 1 }), 0.8],
    ["planned but nothing kept", week({ completed: 3, scheduledMinutes: 120 }), 0.5],
  ])("%s", (_name, signals, score) => expect(weekScore(signals)).toBe(score));
});

describe("band", () => {
  it.each([
    ["day 0 (not started)", 0.9, 0, 84, "too_early"],
    ["the first week of 12", 0.9, 7, 84, "too_early"],
    ["day 8 of 12 weeks", 0.9, 8, 84, "on_track"],
    ["day 3 of a 12-day sprint (a quarter)", 0.9, 3, 12, "too_early"],
    ["day 4 of a 12-day sprint", 0.9, 4, 12, "on_track"],
    ["exactly On track", statusRules.onTrack, 30, 84, "on_track"],
    ["just under On track", statusRules.onTrack - 0.01, 30, 84, "adjust"],
    ["exactly Adjust", statusRules.adjust, 30, 84, "adjust"],
    ["just under Adjust", statusRules.adjust - 0.01, 30, 84, "off_track"],
    ["zero", 0, 30, 84, "off_track"],
  ] as const)("%s", (_name, score, day, length, band) => expect(bandOf(score, day, length)).toBe(band));
});

describe("goal status", () => {
  const full = week({ completed: 3 }), half = week({ completed: 1, ratings: ["mixed"] }), none = week();
  it.each([
    ["no weeks yet", 0, [], { band: "too_early", score: 0, weeks: [], projection: 0 }],
    ["one good partial first week is too early", 3, [{ ...full, elapsed: 3 / 7 }], { band: "too_early", score: 1, weeks: [1], projection: 1 }],
    // Recent weeks weigh 3:2:1; the slope (-0.5/week, damped by half) runs over the 8 weeks left.
    ["steady full weeks", 28, [full, full, full, full], { band: "on_track", score: 1, weeks: [1, 1, 1, 1], projection: 1 }],
    ["one empty week after two good ones: Adjust, projected to fall", 21, [full, full, none], { band: "adjust", score: 0.5, weeks: [1, 1, 0], projection: 0 }],
    // (0 × 1 + 0 × 2 + 1 × 3) / 6: Adjust now, but the climb projects On track at the end.
    ["recovering", 21, [none, none, full], { band: "adjust", score: 0.5, weeks: [0, 0, 1], projection: 1 }],
    ["middling", 21, [half, half, half], { band: "adjust", score: 0.43, weeks: [0.43, 0.43, 0.43], projection: 0.43 }],
  ] as const)("%s", (_name, day, weeks, expected) => expect(goalStatus({ day, length: 84, weeks: [...weeks] })).toEqual(expected));

  it("weights the current week by how much of it has passed", () => {
    // Day 15: week 3 has one of seven days; (1 × 1 + 1 × 2 + 0 × 3/7) / (3 + 3/7).
    const status = goalStatus({ day: 15, length: 84, weeks: [full, full, { ...none, elapsed: 1 / 7 }] });
    expect(status.score).toBe(0.88);
    expect(status.band).toBe("on_track");
  });
});

describe("season statuses", () => {
  const zone = "UTC";
  const task = (id: string, patch: Partial<WeekTask> = {}): WeekTask => ({ id, projectId: null, status: "todo", dueDate: null, dueDateEnd: null, completedAt: null, ...patch });
  const at = (iso: string) => new Date(iso);
  const inputs: StatusInputs = {
    links: { projects: [{ goalId: "v2", projectId: "p-v2" }], tasks: [{ goalId: "fit", taskId: "run1" }, { goalId: "fit", taskId: "run2" }, { goalId: "fit", taskId: "gym" }, { goalId: "fit", taskId: "later" }] },
    tasks: [
      // Week 1 (1-7 Mar): two runs kept; week 2: a gym session missed; one scheduled later today, not yet missed.
      task("run1", { status: "done", dueDate: at("2026-03-02T07:00:00Z"), dueDateEnd: at("2026-03-02T08:00:00Z"), completedAt: at("2026-03-02T08:00:00Z") }),
      task("run2", { status: "done", dueDate: at("2026-03-04T07:00:00Z"), completedAt: at("2026-03-04T08:00:00Z") }),
      task("gym", { dueDate: at("2026-03-10T17:00:00Z") }),
      task("later", { dueDate: at("2026-03-12T18:00:00Z") }),
      // v2 through its project: a milestone reached in week 2.
      task("ship", { projectId: "p-v2", status: "done", completedAt: at("2026-03-09T10:00:00Z") }),
    ],
    ratings: [{ goalId: "fit", day: "2026-03-03", rating: "solid" }, { goalId: "fit", day: "2026-03-10", rating: "little" }, { goalId: "v2", day: "2026-02-28", rating: "massive" }],
    milestones: [{ goalId: "v2", criteria: [{ text: "Tagged", done: true }], done: true, completedAt: at("2026-03-09T10:00:00Z") }],
  };
  const statuses = seasonStatuses({ startDate: "2026-03-01", lengthDays: 28, today: "2026-03-12", now: at("2026-03-12T12:00:00Z"), zone, goalIds: ["fit", "v2"], inputs });

  it("scores each season week from its ratings, tasks and kept time, up to now", () => {
    // Week 1: 2 done, 90 of 90 minutes kept, Solid → (0.3 × 2/3 + 0.4 × 0.75 + 0.3 × 1) / 1.0.
    // Week 2 so far: nothing done, 30 minutes missed (the 18:00 task is still ahead), Little → (0 + 0.4 × 0.2 + 0) / 1.0.
    expect(statuses.fit!.weeks).toEqual([0.8, 0.08]);
    expect(statuses.fit!.band).toBe("adjust");
  });

  it("counts a reached milestone in the week its task was done; ratings outside the season are ignored", () => {
    // Week 1 empty; week 2: one task and the milestone → (0.3 × 1/3 + 0.2) / 0.5.
    expect(statuses.v2!.weeks).toEqual([0, 0.6]);
  });

  it("is too early in the first days and has no weeks before the start", () => {
    expect(seasonStatuses({ startDate: "2026-03-01", lengthDays: 28, today: "2026-02-27", now: at("2026-02-27T12:00:00Z"), zone, goalIds: ["fit"], inputs }).fit)
      .toEqual({ band: "too_early", score: 0, weeks: [], projection: 0 });
    expect(seasonStatuses({ startDate: "2026-03-01", lengthDays: 28, today: "2026-03-05", now: at("2026-03-05T12:00:00Z"), zone, goalIds: ["fit"], inputs }).fit!.band).toBe("too_early");
  });
});
