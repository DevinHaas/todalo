import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./parse-quick-add";

// Wednesday 2026-01-14, used as a fixed "now" so date math is deterministic.
const REFERENCE = new Date(2026, 0, 14);

function dateOnly(y: number, m: number, d: number) {
  return new Date(y, m, d);
}

describe("parseQuickAdd", () => {
  it("leaves titles with no match untouched", () => {
    const result = parseQuickAdd("call mom", REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.strippedTitle).toBe("call mom");
    expect(result.dueDate).toBeNull();
    expect(result.startTime).toBeNull();
    expect(result.recurrence).toBeNull();
  });

  it("recognizes today and its abbreviation", () => {
    for (const word of ["today", "tod"]) {
      const result = parseQuickAdd(`water plants ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 14));
      expect(result.strippedTitle).toBe("water plants");
    }
  });

  it("recognizes tomorrow and its abbreviation", () => {
    for (const word of ["tomorrow", "tom"]) {
      const result = parseQuickAdd(`call mom ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
      expect(result.strippedTitle).toBe("call mom");
    }
  });

  it("recognizes weekday names and 3-letter abbreviations", () => {
    // Reference is Wednesday; "friday"/"fri" should land 2 days out.
    for (const word of ["friday", "fri"]) {
      const result = parseQuickAdd(`gym ${word}`, REFERENCE);
      expect(result.dueDate).toEqual(dateOnly(2026, 0, 16));
    }
    // A weekday equal to today resolves to today, not 7 days out.
    const sameDay = parseQuickAdd("standup wednesday", REFERENCE);
    expect(sameDay.dueDate).toEqual(dateOnly(2026, 0, 14));
    // A weekday earlier in the week than today rolls into next week.
    const earlier = parseQuickAdd("standup monday", REFERENCE);
    expect(earlier.dueDate).toEqual(dateOnly(2026, 0, 19));
  });

  it("recognizes next week as the following Monday", () => {
    const result = parseQuickAdd("plan trip next week", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 19));
    expect(result.strippedTitle).toBe("plan trip");
  });

  it("recognizes explicit month-day dates", () => {
    const result = parseQuickAdd("taxes jan 27", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 27));
    expect(result.strippedTitle).toBe("taxes");
  });

  it("rolls an explicit date into next year once it has passed", () => {
    const result = parseQuickAdd("taxes jan 1", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2027, 0, 1));
  });

  it("recognizes numeric dd/mm and dd.mm dates", () => {
    const slash = parseQuickAdd("passport renewal 27/1", REFERENCE);
    expect(slash.dueDate).toEqual(dateOnly(2026, 0, 27));

    const dot = parseQuickAdd("standup 21.12", REFERENCE);
    expect(dot.dueDate).toEqual(dateOnly(2026, 11, 21));
  });

  it("recognizes time-of-day and converts to 24-hour HH:mm", () => {
    const result = parseQuickAdd("call mom at 4pm", REFERENCE);
    expect(result.startTime).toBe("16:00");
    expect(result.strippedTitle).toBe("call mom");

    const withMinutes = parseQuickAdd("call mom at 4:30pm", REFERENCE);
    expect(withMinutes.startTime).toBe("16:30");

    const am = parseQuickAdd("call mom at 9am", REFERENCE);
    expect(am.startTime).toBe("09:00");

    const noonHour = parseQuickAdd("call mom at 12pm", REFERENCE);
    expect(noonHour.startTime).toBe("12:00");
  });

  it("combines a date match and a time match from the same title", () => {
    const result = parseQuickAdd("call mom tomorrow at 4pm", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
    expect(result.startTime).toBe("16:00");
    expect(result.strippedTitle).toBe("call mom");
  });

  it.each([
    ["every day", { n: 1, unit: "day" }],
    ["daily", { n: 1, unit: "day" }],
    ["every week", { n: 1, unit: "week" }],
    ["weekly", { n: 1, unit: "week" }],
    ["every month", { n: 1, unit: "month" }],
    ["monthly", { n: 1, unit: "month" }],
    ["every 3 days", { n: 3, unit: "day" }],
    ["every 2 weeks", { n: 2, unit: "week" }],
    ["every 1 month", { n: 1, unit: "month" }],
    ["every 4 years", { n: 4, unit: "year" }],
  ] as const)("recognizes recurrence phrase %j", (phrase, expected) => {
    const result = parseQuickAdd(`water plants ${phrase}`, REFERENCE);
    expect(result.recurrence).toEqual({
      n: expected.n,
      unit: expected.unit,
      basedOn: "scheduled",
      until: null,
    });
    expect(result.strippedTitle).toBe("water plants");
  });

  it("rejects partial-word matches (whole-word boundaries only)", () => {
    const result = parseQuickAdd("Monica's birthday", REFERENCE);
    expect(result.matches).toEqual([]);
    expect(result.dueDate).toBeNull();
    expect(result.strippedTitle).toBe("Monica's birthday");
  });

  it("still highlights ambiguous whole-word matches, relying on click-to-reject", () => {
    const result = parseQuickAdd("Create monthly report", REFERENCE);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe("monthly");
    expect(result.recurrence).toEqual({ n: 1, unit: "month", basedOn: "scheduled", until: null });
  });

  it("prefers the longest match on overlapping candidates", () => {
    const result = parseQuickAdd("plan trip next week", REFERENCE);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe("next week");
  });

  it("matches case-insensitively", () => {
    const result = parseQuickAdd("Call mom TOMORROW", REFERENCE);
    expect(result.dueDate).toEqual(dateOnly(2026, 0, 15));
  });

  it("returns match offsets that point back into the original text", () => {
    const text = "call mom tomorrow";
    const result = parseQuickAdd(text, REFERENCE);
    const [match] = result.matches;
    expect(text.slice(match.start, match.end)).toBe(match.text);
    expect(match.kind).toBe("date");
  });
});
