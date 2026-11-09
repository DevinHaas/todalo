import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftPanel, draftTime, overflowQuestion } from "./draft-views";
import { pendingRowClass } from "./pending-changes";
import type { DraftDto } from "./coach";

// Goals ticket 28: tasks that don't fit come with a Yes/No question, even when nothing else is pending.
describe("draft overflow", () => {
  const overflow = [{ title: "Run", minutes: 45, reason: "The dentist fills the afternoon." }, { title: "Read", minutes: 30, reason: "No room." }, { title: "Call", minutes: 15, reason: "No room." }];
  const draft: DraftDto = { id: "d1", kind: "day", period: "2026-02-09", summary: "", createdAt: "2026-02-09T08:00:00Z", items: [], overflow };

  it("asks about tomorrow for a day, the next day with room otherwise", () => {
    expect(overflowQuestion(draft)).toBe("3 tasks don't fit today. Schedule them tomorrow?");
    expect(overflowQuestion({ kind: "day", overflow: overflow.slice(0, 1) })).toBe("1 task doesn't fit today. Schedule it tomorrow?");
    expect(overflowQuestion({ kind: "week", overflow })).toBe("3 tasks don't fit these days. Schedule them on the next day with room?");
  });

  it("shows the question with Yes and No, and no Accept all without items", () => {
    const html = renderToStaticMarkup(createElement(DraftPanel, { scope: "day", draft, drafting: false, deciding: false, message: null, onDecide: () => {}, onOverflow: () => {} }));
    expect(html).toContain("3 tasks don&#x27;t fit today. Schedule them tomorrow?");
    expect(html).toContain("The dentist fills the afternoon.");
    expect(html).toContain('data-draft-action="overflow-schedule"');
    expect(html).toContain('data-draft-action="overflow-drop"');
    expect(html).not.toContain('data-draft-action="accept-all"');
  });
});

// Goals ticket 30: completions, deletions and moves to another place.
describe("complete, delete and move", () => {
  const start = "2026-02-11T23:00:00Z";
  it("says what will happen, with the target place", () => {
    expect(draftTime({ op: "complete", start, end: null })).toBe("Will complete");
    expect(draftTime({ op: "delete", start, end: null })).toBe("Will delete");
    expect(draftTime({ op: "move", start, end: null, place: { projectId: "h", sectionId: null, label: "Health", keepsDate: true } })).toBe("To Health");
    expect(draftTime({ op: "move", start, end: null, place: { projectId: "h", sectionId: "g", label: "Health › Gym" } })).toMatch(/^Due .+, Health › Gym$/);
  });

  it("fades a task to complete and strikes one to delete in red", () => {
    const item = (op: "complete" | "delete") => ({ id: "i", op, taskId: "t", title: "t", start, end: null, goalId: null, reason: "", state: "pending" as const });
    expect(pendingRowClass(item("complete"))).toContain("opacity-60");
    expect(pendingRowClass(item("delete"))).toContain("outline-destructive");
  });
});
