import { describe, expect, it } from "vitest";
import { goalTime } from "./time-block-dto";

const from = new Date("2026-02-16T00:00:00Z"), to = new Date("2026-02-23T00:00:00Z");
const block = (goalId: string | null, start: string, end: string, outcome: "planned" | "done" | "skipped" | "rescheduled" = "planned") =>
  ({ goalId, start: `2026-02-${start}:00Z`, end: `2026-02-${end}:00Z`, outcome });

describe("goalTime", () => {
  it.each([
    ["nothing reserved", [], []],
    ["a planned block reserves but keeps nothing", [block("v2", "17T09:00", "17T11:00")], [{ goalId: "v2", reservedMinutes: 120, keptMinutes: 0 }]],
    ["done blocks are kept; skipped and rescheduled only reserved", [
      block("v2", "17T09:00", "17T10:00", "done"), block("v2", "18T09:00", "18T09:30", "skipped"),
      block("v2", "19T09:00", "19T09:45", "rescheduled"), block("fit", "18T07:00", "18T08:00", "done"),
    ], [{ goalId: "v2", reservedMinutes: 135, keptMinutes: 60 }, { goalId: "fit", reservedMinutes: 60, keptMinutes: 60 }]],
    ["blocks without a goal are left out", [block(null, "17T09:00", "17T10:00", "done")], []],
    ["blocks outside the week are left out", [block("v2", "15T09:00", "15T10:00"), block("v2", "23T00:00", "23T01:00")], []],
    ["a block crossing the week's edges counts only its inside part", [block("v2", "15T23:00", "16T01:00", "done"), block("v2", "22T23:30", "23T01:00")],
      [{ goalId: "v2", reservedMinutes: 90, keptMinutes: 60 }]],
  ])("%s", (_name, blocks, expected) => {
    expect(goalTime(blocks as Parameters<typeof goalTime>[0], from, to)).toEqual(expected);
  });
});
