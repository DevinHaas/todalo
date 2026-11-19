import { describe, expect, it } from "vitest";
import { dueRituals, type RitualsDto } from "./rituals";

const state = (extra: Partial<RitualsDto> = {}): RitualsDto => ({
  settings: {
    checkIn: { enabled: true, time: "08:00" }, eveningReview: { enabled: true, time: "20:00" },
    weeklyReview: { enabled: true, day: 1, time: "18:00" }, seasonReview: { enabled: true }, notify: false,
  },
  checkIn: { period: "2026-11-09", status: null, taskId: null },
  eveningReview: { period: "2026-11-09", status: null, taskId: null },
  weeklyReview: { period: "2026-11-02", status: null },
  seasonReview: { period: "2026-10-05", status: null, due: false },
  ...extra,
});
// 9 Nov 2026 is a Monday.
const at = (day: number, time: string) => new Date(`2026-11-${String(day).padStart(2, "0")}T${time}:00`);

describe("the sidebar's due rituals", () => {
  it("shows a ritual once its time has come, even with notifications off", () => {
    expect(dueRituals(state(), at(9, "07:59"))).toEqual([]);
    expect(dueRituals(state(), at(9, "08:00"))).toEqual(["checkIn"]);
    expect(dueRituals(state(), at(9, "20:30"))).toEqual(["checkIn", "eveningReview", "weeklyReview"]);
  });

  it("hides a ritual that is done or skipped", () => {
    const handled = state({ checkIn: { period: "2026-11-09", status: "skipped", taskId: null }, weeklyReview: { period: "2026-11-02", status: "completed" } });
    expect(dueRituals(handled, at(9, "19:00"))).toEqual([]);
  });

  it("keeps a missed Weekly review two more days, then lets it go", () => {
    const daily = { checkIn: { enabled: false, time: "08:00" }, eveningReview: { enabled: false, time: "20:00" } };
    const weeklyOnly = state({ settings: { ...state().settings, ...daily } });
    expect(dueRituals(weeklyOnly, at(10, "09:00"))).toEqual(["weeklyReview"]);
    expect(dueRituals(weeklyOnly, at(11, "09:00"))).toEqual(["weeklyReview"]);
    expect(dueRituals(weeklyOnly, at(12, "09:00"))).toEqual([]);
  });

  it("shows the Season review only when the season is ending and the review is on", () => {
    const ending = state({ seasonReview: { period: "2026-10-05", status: null, due: true } });
    expect(dueRituals(ending, at(9, "07:00"))).toEqual(["seasonReview"]);
    expect(dueRituals({ ...ending, settings: { ...ending.settings, seasonReview: { enabled: false } } }, at(9, "07:00"))).toEqual([]);
  });
});
