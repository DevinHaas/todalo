import { describe, expect, it } from "vitest";
import { addDays, checkInDay, checkInPeriod, mondayOf, ritualRunInput, weeklyReviewPeriod } from "./ritual-dto";

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
