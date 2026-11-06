import { describe, expect, it } from "vitest";
import { seasonProgress, todayIn } from "./season-days";
import { tooManyPrimary } from "./season-dto";

describe("season day count", () => {
  it.each([
    ["first day", "2026-01-01", 84, "2026-01-01", { phase: "running", day: 1, length: 84, daysLeft: 83, startsIn: 0 }],
    ["day 52 of 84", "2026-01-01", 84, "2026-02-21", { phase: "running", day: 52, length: 84, daysLeft: 32, startsIn: 0 }],
    ["last day", "2026-01-01", 28, "2026-01-28", { phase: "running", day: 28, length: 28, daysLeft: 0, startsIn: 0 }],
    ["the day after the last", "2026-01-01", 28, "2026-01-29", { phase: "over", day: 28, length: 28, daysLeft: 0, startsIn: 0 }],
    ["tomorrow's start", "2026-01-02", 28, "2026-01-01", { phase: "upcoming", day: 0, length: 28, daysLeft: 28, startsIn: 1 }],
    ["across a leap day", "2028-02-28", 10, "2028-03-01", { phase: "running", day: 3, length: 10, daysLeft: 7, startsIn: 0 }],
    ["across a DST change (dates only)", "2026-03-28", 7, "2026-03-30", { phase: "running", day: 3, length: 7, daysLeft: 4, startsIn: 0 }],
    ["a one-day custom season", "2026-05-05", 1, "2026-05-05", { phase: "running", day: 1, length: 1, daysLeft: 0, startsIn: 0 }],
  ] as const)("%s", (_name, start, length, today, expected) => {
    expect(seasonProgress(start, length, today)).toEqual(expected);
  });

  it.each([
    ["UTC", "2026-03-01T23:30:00Z", "2026-03-01"],
    ["Pacific/Auckland is already tomorrow", "2026-03-01T23:30:00Z", "2026-03-02"],
    ["America/Los_Angeles is still yesterday", "2026-03-02T05:00:00Z", "2026-03-01"],
  ])("today in %s", (zone, now, expected) => {
    expect(todayIn(zone.split(" ")[0]!, new Date(now))).toBe(expected);
  });

  it.each([
    ["three primary is the guideline", ["primary", "primary", "primary", "secondary"], false],
    ["a fourth primary is warned about", ["primary", "primary", "primary", "primary"], true],
    ["secondary goals never count", ["secondary", "secondary", "secondary", "secondary", "primary"], false],
  ] as const)("%s", (_name, tiers, expected) => {
    expect(tooManyPrimary(tiers.map(tier => ({ tier })))).toBe(expected);
  });
});
