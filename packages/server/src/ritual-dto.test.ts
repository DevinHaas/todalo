import { describe, expect, it } from "vitest";
import { addDays, checkInDay, checkInPeriod, defaultRitualSettings, mondayOf, readyRituals, ritualRunInput, weeklyReviewPeriod, type RitualsDto, type RunStatus } from "./ritual-dto";

describe("ritual days", () => {
  it.each([
    ["2026-03-10", -1, "2026-03-09"], ["2026-03-01", -1, "2026-02-28"], ["2028-03-01", -1, "2028-02-29"],
    ["2026-12-31", 1, "2027-01-01"], ["2026-03-29", 1, "2026-03-30"],
  ])("%s %+d days is %s", (day, days, expected) => expect(addDays(day, days)).toBe(expected));

  it.each([
    ["2026-03-10", false, "2026-03-10"], ["2026-03-10", true, "2026-03-11"],
  ])("the Check-in on %s (done today: %s) sits on %s", (today, done, expected) => expect(checkInDay(today, done)).toBe(expected));

  it("reflects on yesterday", () => expect(checkInPeriod("2026-01-01")).toBe("2025-12-31"));

  it("trims context and turns an empty one into null", () => {
    const run = ritualRunInput.parse({ kind: "checkIn", period: "2026-03-09", status: "completed", ratings: [{ goalId: "g", rating: "solid", context: "   " }] });
    expect(run.ratings[0]!.context).toBeNull();
  });
});

describe("weekly review week", () => {
  // 2026-03-09 is a Monday.
  it.each([
    ["2026-03-15", "2026-03-09"], ["2026-03-12", "2026-03-09"], ["2026-03-11", "2026-03-02"],
    ["2026-03-16", "2026-03-09"], ["2026-03-09", "2026-03-02"], ["2026-01-01", "2025-12-29"],
  ])("a review on %s reviews the week of %s", (today, expected) => expect(weeklyReviewPeriod(today)).toBe(expected));

  it.each([["2026-03-09", "2026-03-09"], ["2026-03-15", "2026-03-09"], ["2026-03-10", "2026-03-09"]])("%s is in the week of %s", (day, monday) => expect(mondayOf(day)).toBe(monday));
});

describe("ritual-ready notifications (ticket 14b)", () => {
  const on = { ...defaultRitualSettings, checkIn: { enabled: true, time: "09:00" }, eveningReview: { enabled: true, time: "20:00" }, weeklyReview: { enabled: true, day: 0, time: "17:00" } };
  const state = (settings = on, status: RunStatus | null = null): Pick<RitualsDto, "settings" | "checkIn" | "eveningReview" | "weeklyReview"> => ({
    settings, checkIn: { period: "2026-03-14", status, taskId: null }, eveningReview: { period: "2026-03-15", status, taskId: null }, weeklyReview: { period: "2026-03-09", status },
  });
  // 2026-03-15 is a Sunday (weekday 0); Monday is 1.
  it.each([
    ["before every time", state(), "08:59", 0, []],
    ["the Check-in at its time", state(), "09:00", 0, ["checkIn:2026-03-14"]],
    ["the Weekly review on its day", state(), "17:30", 0, ["checkIn:2026-03-14", "weeklyReview:2026-03-09"]],
    ["not the Weekly review on another day", state(), "17:30", 1, ["checkIn:2026-03-14"]],
    ["the Evening review in the evening", state(), "21:00", 1, ["checkIn:2026-03-14", "eveningReview:2026-03-15"]],
    ["nothing done or skipped", state(on, "completed"), "23:00", 0, []],
    ["nothing skipped either", state(on, "skipped"), "23:00", 0, []],
    ["nothing while notifications are off", state({ ...on, notify: false }), "23:00", 0, []],
    ["nothing while a ritual is off", state(defaultRitualSettings), "23:00", 0, []],
  ] as const)("%s", (_, rituals, time, weekday, expected) =>
    expect(readyRituals(rituals, time, weekday).map(item => `${item.kind}:${item.period}`)).toEqual(expected));
});
