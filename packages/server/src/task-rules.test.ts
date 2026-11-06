import { afterEach, describe, expect, it } from "vitest";
import type { Recurrence } from "@todalo/ramble/recurrence";
import { editConflicts, planCompletion, type CompletionTarget } from "./task-rules";

// Recurrence runs in the server process's zone (legacy Server Actions did too),
// so each case pins TZ. Node applies a runtime TZ change to Date immediately.
const originalZone = process.env.TZ;
afterEach(() => { process.env.TZ = originalZone; });
const zone = (name: string) => { process.env.TZ = name; };

const every = (n: number, unit: Recurrence["unit"], extra: Partial<Recurrence> = {}): Recurrence => ({ n, unit, basedOn: "scheduled", ...extra });
const open = (dueDate: Date | null, recurrence: Recurrence | null = null, extra: Partial<CompletionTarget> = {}): CompletionTarget => ({ status: "todo", dueDate, recurrence, ...extra });
const OP = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
const nextDue = (task: CompletionTarget, now: Date) => {
  const plan = planCompletion(task, { occurrence: task.dueDate, operationId: OP }, now);
  if (plan.kind !== "write") throw new Error(plan.kind);
  if (!plan.patch.dueDate) throw new Error("not advanced");
  return plan.patch.dueDate;
};

describe("recurring completion (legacy rules)", () => {
  it("advances a scheduled recurrence from its due date even when completed late, keeping it open", () => {
    zone("UTC");
    const plan = planCompletion(open(new Date(2026, 0, 1), every(1, "day")), { occurrence: new Date(2026, 0, 1), operationId: OP }, new Date(2026, 0, 5, 18));
    expect(plan).toEqual({ kind: "write", patch: { dueDate: new Date(2026, 0, 2), completedAt: null, lastCompletionId: OP } });
  });

  it("advances a completed-based recurrence from the completion time", () => {
    zone("UTC");
    expect(nextDue(open(new Date(2026, 0, 1), every(3, "day", { basedOn: "completed" })), new Date(2026, 0, 5, 18))).toEqual(new Date(2026, 0, 8, 18));
    // Undated recurring tasks also count from completion.
    expect(planCompletion(open(null, every(1, "week")), {}, new Date(2026, 0, 5))).toMatchObject({ patch: { dueDate: new Date(2026, 0, 12) } });
  });

  it("treats until as inclusive and completes the last occurrence", () => {
    zone("UTC");
    const now = new Date(2026, 0, 1, 9);
    expect(nextDue(open(new Date(2026, 0, 1), every(1, "day", { until: new Date(2026, 0, 2) })), now)).toEqual(new Date(2026, 0, 2));
    // jsonb returns until as an ISO string; the rule compares instants the same way.
    const last = planCompletion(open(new Date(2026, 0, 2), every(1, "day", { until: new Date(2026, 0, 2).toISOString() as unknown as Date })), {}, now);
    expect(last).toEqual({ kind: "write", patch: { status: "done", completedAt: now, lastCompletionId: null } });
  });

  it("clamps month ends and leap days like date-fns (and keeps the clamped day afterwards)", () => {
    zone("Europe/Berlin");
    const now = new Date(2026, 0, 31, 12);
    expect(nextDue(open(new Date(2026, 0, 31), every(1, "month")), now)).toEqual(new Date(2026, 1, 28));
    expect(nextDue(open(new Date(2026, 1, 28), every(1, "month")), now)).toEqual(new Date(2026, 2, 28));
    expect(nextDue(open(new Date(2028, 0, 31), every(1, "month")), now)).toEqual(new Date(2028, 1, 29));
    expect(nextDue(open(new Date(2028, 1, 29), every(1, "year")), now)).toEqual(new Date(2029, 1, 28));
    expect(nextDue(open(new Date(2026, 9, 31, 9, 30), every(2, "month")), now)).toEqual(new Date(2026, 11, 31, 9, 30));
  });

  it("keeps the local wall-clock time across daylight-saving changes in the server's zone", () => {
    zone("Europe/Berlin");
    // 29 Mar 2026 springs forward, 25 Oct 2026 falls back.
    expect(nextDue(open(new Date(2026, 2, 28), every(1, "day")), new Date())).toEqual(new Date(2026, 2, 29));
    expect(nextDue(open(new Date(2026, 2, 28, 9), every(1, "week")), new Date()).toISOString()).toBe("2026-04-04T07:00:00.000Z");
    expect(nextDue(open(new Date(2026, 9, 24, 23, 30), every(1, "day")), new Date()).toISOString()).toBe("2026-10-25T22:30:00.000Z");
    zone("America/New_York");
    expect(nextDue(open(new Date(2026, 2, 7, 8), every(1, "day")), new Date()).toISOString()).toBe("2026-03-08T12:00:00.000Z");
  });

  it("documents the legacy UTC-server reading of a local-midnight due date (stored as 23:00Z in Berlin winter)", () => {
    zone("UTC");
    // Berlin 28 Mar 00:00 CET is 27 Mar 23:00Z. A UTC server adds a UTC day, so
    // after the spring change the Berlin viewer sees 29 Mar 01:00, as legacy did.
    expect(nextDue(open(new Date("2026-03-27T23:00:00.000Z"), every(1, "day")), new Date()).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    // A Berlin 31 Jan due date is 30 Jan 23:00Z, so monthly lands on 28 Feb 23:00Z (Berlin 1 Mar).
    expect(nextDue(open(new Date("2026-01-30T23:00:00.000Z"), every(1, "month")), new Date()).toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });

  it("completes a non-recurring task", () => {
    const now = new Date(2026, 0, 1, 9);
    expect(planCompletion(open(null), { occurrence: null, operationId: OP }, now)).toEqual({ kind: "write", patch: { status: "done", completedAt: now, lastCompletionId: OP } });
  });
});

describe("completion replays and stale reads", () => {
  const due = new Date(2026, 9, 15);
  it("recognises its own operation after the recurring task moved on", () => {
    const advanced = open(new Date(2026, 9, 16), every(1, "day"), { lastCompletionId: OP });
    expect(planCompletion(advanced, { occurrence: due, operationId: OP })).toEqual({ kind: "unchanged" });
  });

  it("refuses a completion for a date the task no longer has (another device edited or completed it)", () => {
    const moved = open(new Date(2026, 9, 20), every(1, "day"), { lastCompletionId: "another-tap" });
    expect(planCompletion(moved, { occurrence: due, operationId: OP })).toEqual({ kind: "changed" });
    expect(planCompletion(open(null, every(1, "day")), { occurrence: due, operationId: OP })).toEqual({ kind: "changed" });
  });

  it("leaves a done task alone, and keeps ticket 5's silent no-op for requests without an operation ID", () => {
    expect(planCompletion(open(due, null, { status: "done" }), { occurrence: due, operationId: OP })).toEqual({ kind: "unchanged" });
    expect(planCompletion(open(new Date(2026, 9, 16), every(1, "day")), { occurrence: due })).toEqual({ kind: "unchanged" });
  });
});

describe("edit conflicts", () => {
  const seen = new Date("2026-10-15T10:00:00.000Z");
  const later = new Date("2026-10-15T10:05:00.000Z");
  const stored = { title: "Plan", dueDate: new Date("2026-10-15T00:00:00.000Z"), recurrence: { until: null, unit: "day", basedOn: "scheduled", n: 1 }, deadline: null };

  it("allows edits from the current copy and legacy callers without a seen version", () => {
    expect(editConflicts({ ...stored, updatedAt: seen }, { title: "Other" }, seen)).toBe(false);
    expect(editConflicts({ ...stored, updatedAt: later }, { title: "Other" })).toBe(false);
  });

  it("refuses an edit from an older copy unless the task already holds the requested values", () => {
    expect(editConflicts({ ...stored, updatedAt: later }, { title: "Other" }, seen)).toBe(true);
    expect(editConflicts({ ...stored, updatedAt: later }, {
      title: "Plan", dueDate: new Date("2026-10-15T00:00:00.000Z"), deadline: undefined,
      recurrence: { n: 1, unit: "day", basedOn: "scheduled", until: null },
    }, seen)).toBe(false);
    expect(editConflicts({ ...stored, updatedAt: later }, { recurrence: { n: 1, unit: "week", basedOn: "scheduled" } }, seen)).toBe(true);
  });
});
