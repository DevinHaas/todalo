import { describe, expect, it } from "vitest";
import { initialSyncState, syncQuickAddFields } from "@todalo/ramble/quick-add-sync";
import { composerFields, dueDateLabel, fromDateValue, parseTitle, quickAddTask, quickDateOptions, repeatPresetsFor } from "./quick-add";

const now = new Date(2026, 9, 15, 10); // Thursday 15 Oct 2026
const local = (day: number, hours = 0, minutes = 0) => new Date(2026, 9, day, hours, minutes).toISOString();
const none = new Set<string>();
const submit = (title: string, state = initialSyncState, rejected = none, enabled = true) =>
  quickAddTask(title, state, parseTitle(title, enabled, rejected, now), now);

describe("smart quick add", () => {
  it("strips detected date, time range and repeat from the title like the legacy composer", () => {
    expect(submit("Call mom tomorrow at 4pm")).toEqual({ title: "Call mom", dueDate: local(16, 16), dueDateEnd: null, recurrence: null });
    expect(submit("Standup every week 9am for 30min")).toMatchObject({
      title: "Standup", dueDate: local(15, 9), dueDateEnd: local(15, 9, 30), recurrence: { n: 1, unit: "week", basedOn: "scheduled", until: null },
    });
  });

  it("keeps the title as typed when date recognition is off or a phrase was rejected", () => {
    expect(submit("Call mom tomorrow", initialSyncState, none, false)).toEqual({ title: "Call mom tomorrow", dueDate: null, dueDateEnd: null, recurrence: null });
    expect(submit("Read Next week's notes tomorrow", initialSyncState, new Set(["next week"]))).toMatchObject({ dueDate: local(16) });
    expect(parseTitle("Call mom tomorrow", true, new Set(["tomorrow"]), now).matches).toEqual([]);
  });

  it("keeps a manual date for an unchanged phrase and the composer's seed date without one", () => {
    const parsed = parseTitle("Pay rent tomorrow", true, none, now);
    const synced = syncQuickAddFields(initialSyncState, { type: "parse", parsed });
    const manual = syncQuickAddFields(synced, { type: "manualDate", date: fromDateValue("2026-10-20"), matchText: "tomorrow" });
    expect(quickAddTask("Pay rent tomorrow", manual, parsed, now)).toMatchObject({ title: "Pay rent", dueDate: local(20) });
    const seeded = syncQuickAddFields(initialSyncState, { type: "seed", date: new Date(2026, 9, 15), time: "" });
    expect(submit("Water plants", seeded)).toMatchObject({ dueDate: local(15) });
    // A time with no date means today.
    const timed = syncQuickAddFields(initialSyncState, { type: "manualTime", time: "08:15", matchText: null });
    expect(submit("Water plants", timed)).toMatchObject({ dueDate: local(15, 8, 15) });
  });

  it("labels and offers the legacy picker dates", () => {
    expect([dueDateLabel(undefined, now), dueDateLabel(new Date(2026, 9, 15, 9), now), dueDateLabel(new Date(2026, 9, 16), now), dueDateLabel(new Date(2026, 9, 31), now)])
      .toEqual(["No Date", "Today", "Tomorrow", "31 Oct"]);
    expect(quickDateOptions(now).map(({ label, day, date }) => [label, day, date.getDate()])).toEqual([
      ["Tomorrow", "Fri", 16], ["Later this week", "Sat", 17], ["This weekend", "Sat", 17], ["Next week", "19 Oct", 19],
    ]);
    expect(quickDateOptions(new Date(2026, 9, 17)).find(option => option.label === "This weekend")?.date.getDate()).toBe(24);
    expect(repeatPresetsFor(new Date(2026, 9, 22)).map(preset => preset.label)).toEqual(["Every day", "Every week on Thursday", "Every month on the 22nd"]);
  });
});

describe("composer metadata and destination", () => {
  const blank = { priority: 4, deadline: "", labelIds: [] };
  it("omits the legacy defaults (Inbox, priority 4, no deadline or labels)", () => {
    expect(composerFields(blank, null, { projectId: null, sectionId: null })).toEqual({});
  });
  it("sends the Additional actions and the composer's project, section and placement", () => {
    expect(composerFields({ priority: 1, deadline: "2026-10-20", labelIds: ["design"] }, "work", { projectId: "work", sectionId: "doing", placement: { edge: "below", anchorId: "a" } })).toEqual({
      projectId: "work", sectionId: "doing", priority: 1, deadline: new Date(2026, 9, 20).toISOString(), labelIds: ["design"], placement: { edge: "below", anchorId: "a" },
    });
  });
  it("drops the section and position when the project picker moves the task elsewhere", () => {
    expect(composerFields(blank, "errands", { projectId: "work", sectionId: "doing", placement: { edge: "top" } })).toEqual({ projectId: "errands" });
    expect(composerFields(blank, null, { projectId: "work", sectionId: "doing", placement: { edge: "bottom" } })).toEqual({});
  });
});
