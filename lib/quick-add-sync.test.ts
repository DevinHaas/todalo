import { describe, expect, it } from "vitest";
import {
  canonicalDateText,
  canonicalRecurrenceText,
  canonicalTimeText,
  initialSyncState,
  syncQuickAddFields,
  type QuickAddSyncState,
} from "./quick-add-sync";
import { parseQuickAdd } from "./parse-quick-add";

const REFERENCE = new Date(2026, 0, 14); // Wednesday

function parseAction(text: string) {
  return { type: "parse" as const, parsed: parseQuickAdd(text, REFERENCE) };
}

describe("syncQuickAddFields", () => {
  it("applies a freshly typed date match to the date field", () => {
    const state = syncQuickAddFields(initialSyncState, parseAction("call mom tomorrow"));
    expect(state.date.value).toEqual(new Date(2026, 0, 15));
    expect(state.date.overridden).toBe(false);
    expect(state.date.appliedMatchText).toBe("tomorrow");
  });

  it("applies a freshly typed recurrence match to the recurrence field", () => {
    const state = syncQuickAddFields(initialSyncState, parseAction("water plants every 3 days"));
    expect(state.recurrence.value).toEqual({ n: 3, unit: "day", basedOn: "scheduled", until: null });
  });

  it("a manual date edit overrides the field and anchors to the current phrase", () => {
    const picked = new Date(2026, 0, 20);
    const manual = syncQuickAddFields(initialSyncState, {
      type: "manualDate",
      date: picked,
      matchText: canonicalDateText(picked),
    });
    expect(manual.date.value).toEqual(picked);
    expect(manual.date.overridden).toBe(true);
    expect(manual.date.appliedMatchText).toBe("20.1");
  });

  it("re-parsing the same anchored phrase does not overwrite a manual choice", () => {
    const picked = new Date(2026, 0, 20);
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, {
      type: "manualDate",
      date: picked,
      matchText: canonicalDateText(picked),
    });
    // Title now reads "...20.1" after the rewrite; re-parsing it must not
    // silently reset the manual choice.
    state = syncQuickAddFields(state, parseAction("call mom 20.1"));
    expect(state.date.value).toEqual(picked);
    expect(state.date.overridden).toBe(true);
  });

  it("lifts the override once the anchored phrase changes to something else", () => {
    const picked = new Date(2026, 0, 20);
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, {
      type: "manualDate",
      date: picked,
      matchText: canonicalDateText(picked),
    });
    state = syncQuickAddFields(state, parseAction("call mom tomorrow"));
    expect(state.date.overridden).toBe(false);
    expect(state.date.value).toEqual(new Date(2026, 0, 15));
    expect(state.date.appliedMatchText).toBe("tomorrow");
  });

  it("lifts the override and clears the value once the anchored phrase disappears", () => {
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, parseAction("call mom tomorrow"));
    const picked = new Date(2026, 0, 20);
    state = syncQuickAddFields(state, {
      type: "manualDate",
      date: picked,
      matchText: canonicalDateText(picked),
    });
    state = syncQuickAddFields(state, parseAction("call mom")); // phrase deleted from title
    expect(state.date.overridden).toBe(false);
    expect(state.date.value).toBeUndefined();
  });

  it("keeps a manual value with no anchoring phrase persisted across parses", () => {
    const picked = new Date(2026, 0, 20);
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, {
      type: "manualDate",
      date: picked,
      matchText: null, // picker used, no typed phrase to anchor to
    });
    state = syncQuickAddFields(state, parseAction("call mom"));
    expect(state.date.value).toEqual(picked);
    expect(state.date.overridden).toBe(true);
  });

  it("a manual recurrence edit overrides a previously-typed recurrence phrase", () => {
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, parseAction("water plants every day"));
    expect(state.recurrence.overridden).toBe(false);
    const custom = { n: 2, unit: "week" as const, basedOn: "scheduled" as const, until: null };
    state = syncQuickAddFields(state, {
      type: "manualRecurrence",
      recurrence: custom,
      matchText: canonicalRecurrenceText(custom),
    });
    expect(state.recurrence.value).toEqual(custom);
    // Re-parsing the original "every day" text (still elsewhere unrelated to
    // the rewritten phrase) must not clobber the manual choice.
    state = syncQuickAddFields(state, parseAction("water plants every 2 weeks"));
    expect(state.recurrence.value).toEqual(custom);
    expect(state.recurrence.overridden).toBe(true);
  });

  it("rejecting a match locks the field so re-parsing never reapplies it, even for a new phrase", () => {
    let state: QuickAddSyncState = syncQuickAddFields(initialSyncState, parseAction("water plants monthly"));
    state = syncQuickAddFields(state, { type: "reject", kind: "recurrence" });
    expect(state.recurrence.locked).toBe(true);
    state = syncQuickAddFields(state, parseAction("water plants every week"));
    expect(state.recurrence.locked).toBe(true);
    expect(state.recurrence.value).toBeUndefined();
  });

  it("canonicalTimeText renders 24h HH:MM as a 12h 'at' phrase", () => {
    expect(canonicalTimeText("16:00")).toBe("at 4pm");
    expect(canonicalTimeText("16:30")).toBe("at 4:30pm");
    expect(canonicalTimeText("00:00")).toBe("at 12am");
    expect(canonicalTimeText("12:00")).toBe("at 12pm");
  });

  it("canonicalRecurrenceText pluralizes units above 1", () => {
    expect(canonicalRecurrenceText({ n: 1, unit: "day", basedOn: "scheduled", until: null })).toBe("every day");
    expect(canonicalRecurrenceText({ n: 3, unit: "day", basedOn: "scheduled", until: null })).toBe("every 3 days");
  });

  it("reset returns to the initial state", () => {
    const state = syncQuickAddFields(initialSyncState, parseAction("call mom tomorrow"));
    expect(syncQuickAddFields(state, { type: "reset" })).toEqual(initialSyncState);
  });
});
