import { describe, expect, it } from "vitest";
import { getNextDueDate, nextOccurrenceOnCompletion, type Recurrence } from "./recurrence";

function scheduled(overrides: Partial<Recurrence> = {}): Recurrence {
  return { n: 1, unit: "day", basedOn: "scheduled", until: null, ...overrides };
}

describe("getNextDueDate", () => {
  it("advances by n units of the given unit", () => {
    const base = new Date(2026, 0, 1);
    expect(getNextDueDate(base, scheduled({ n: 3, unit: "day" }))).toEqual(new Date(2026, 0, 4));
    expect(getNextDueDate(base, scheduled({ n: 2, unit: "week" }))).toEqual(new Date(2026, 0, 15));
    expect(getNextDueDate(base, scheduled({ n: 1, unit: "month" }))).toEqual(new Date(2026, 1, 1));
    expect(getNextDueDate(base, scheduled({ n: 1, unit: "year" }))).toEqual(new Date(2027, 0, 1));
  });
});

describe("nextOccurrenceOnCompletion", () => {
  it("basedOn scheduled advances from dueDate, ignoring completedAt", () => {
    const dueDate = new Date(2026, 0, 1);
    const completedAt = new Date(2026, 0, 5); // completed 4 days late
    const next = nextOccurrenceOnCompletion(dueDate, completedAt, scheduled({ n: 1, unit: "day" }));
    expect(next).toEqual(new Date(2026, 0, 2));
  });

  it("basedOn completed advances from the completion timestamp, not dueDate", () => {
    const dueDate = new Date(2026, 0, 1);
    const completedAt = new Date(2026, 0, 5);
    const next = nextOccurrenceOnCompletion(
      dueDate,
      completedAt,
      scheduled({ n: 3, unit: "day", basedOn: "completed" }),
    );
    expect(next).toEqual(new Date(2026, 0, 8));
  });

  it("falls back to completedAt when there is no dueDate", () => {
    const completedAt = new Date(2026, 0, 5);
    const next = nextOccurrenceOnCompletion(null, completedAt, scheduled({ n: 1, unit: "day" }));
    expect(next).toEqual(new Date(2026, 0, 6));
  });

  it("returns null when the computed next occurrence falls after until", () => {
    const dueDate = new Date(2026, 0, 1);
    const completedAt = new Date(2026, 0, 1);
    const recurrence = scheduled({ n: 1, unit: "day", until: new Date(2026, 0, 1) });
    expect(nextOccurrenceOnCompletion(dueDate, completedAt, recurrence)).toBeNull();
  });

  it("treats until as the last valid occurrence (inclusive), not exclusive", () => {
    const dueDate = new Date(2026, 0, 1);
    const completedAt = new Date(2026, 0, 1);
    // Next occurrence lands exactly on until — still recurs; only a next
    // occurrence strictly after until stops the recurrence.
    const recurrence = scheduled({ n: 1, unit: "day", until: new Date(2026, 0, 2) });
    expect(nextOccurrenceOnCompletion(dueDate, completedAt, recurrence)).toEqual(new Date(2026, 0, 2));
  });

  it("still recurs normally when until is in the future", () => {
    const dueDate = new Date(2026, 0, 1);
    const completedAt = new Date(2026, 0, 1);
    const recurrence = scheduled({ n: 1, unit: "day", until: new Date(2026, 5, 1) });
    expect(nextOccurrenceOnCompletion(dueDate, completedAt, recurrence)).toEqual(new Date(2026, 0, 2));
  });
});
