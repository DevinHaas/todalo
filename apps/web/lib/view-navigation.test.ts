import { describe, expect, it } from "vitest";
import { navigateViewDate, nextLayout } from "./view-navigation";

describe("visible view navigation", () => {
  it("moves by calendar weeks across a month boundary and returns to today", () => {
    const anchor = new Date(2026, 9, 28, 12);
    const next = navigateViewDate(anchor, "next-week", new Date(2026, 9, 4));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 10, 4]);
    const previous = navigateViewDate(anchor, "previous-week", new Date(2026, 9, 4));
    expect([previous.getMonth(), previous.getDate()]).toEqual([9, 21]);
    const today = navigateViewDate(next, "today", new Date(2026, 9, 4, 13));
    expect([today.getMonth(), today.getDate(), today.getHours()]).toEqual([9, 4, 0]);
  });
  it("cycles all supported layouts in both directions", () => {
    expect(nextLayout("list")).toBe("board");
    expect(nextLayout("board")).toBe("calendar");
    expect(nextLayout("calendar")).toBe("list");
    expect(nextLayout("list", -1)).toBe("calendar");
  });
});
