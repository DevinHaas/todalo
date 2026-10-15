import { describe, expect, it } from "vitest";
import { prepareTaskRows, rambleTaskId } from "./commit-rows";
import { rambleCommitInput } from "@todalo/ramble/commit";
import { createRambleSession, interpretSegment } from "@todalo/ramble";
import { zonedTaskDate } from "./dates";

function capture(phrases: string[]) {
  let state = createRambleSession({ referenceDate: new Date("2026-10-03T12:00:00"), projectId: "project" });
  for (const phrase of phrases) state = interpretSegment(phrase, state).nextState;
  return state.todos;
}

const OP = "4f9c1a2e-8d3b-4c5a-9e7f-1a2b3c4d5e6f";

describe("atomic commit row preparation", () => {
  it("allocates actual IDs and links children within the same batch", () => {
    const todos = capture(["parent tomorrow at 4pm", "sub task", "child"]);
    const rows = prepareTaskRows(todos, "user", "Europe/Zurich", OP);
    expect(rows[0].id).not.toBe(todos[0].id);
    expect(rows[1].parentId).toBe(rows[0].id);
    expect(rows.every((row) => row.userId === "user")).toBe(true);
    expect(rows[0].dueDate?.toISOString()).toBe("2026-10-04T14:00:00.000Z");
  });
  it("rejects orphan, duplicate, self and deep child references", () => {
    const todos = capture(["parent", "sub task", "child"]);
    expect(() => prepareTaskRows([{ ...todos[1], parentId: "missing" }], "user", "UTC", OP)).toThrow();
    expect(() => prepareTaskRows([todos[0], todos[0]], "user", "UTC", OP)).toThrow();
    expect(() => prepareTaskRows([{ ...todos[0], parentId: todos[0].id }], "user", "UTC", OP)).toThrow();
    expect(() => prepareTaskRows([...todos, { ...todos[1], id: "grandchild", parentId: todos[1].id }], "user", "UTC", OP)).toThrow();
  });
  it("preserves overnight end times and recurrence", () => {
    const rows = prepareTaskRows(capture(["work tomorrow from 23:00 to 01:00 every day"]), "user", "Europe/Zurich", OP);
    expect(rows[0].dueDateEnd!.getTime() - rows[0].dueDate!.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(rows[0].recurrence).toMatchObject({ n: 1, unit: "day" });
  });
  it("resolves future DST, all-day dates and half-hour timezone offsets", () => {
    expect(zonedTaskDate("2026-11-03", "16:00", "Europe/Zurich")?.toISOString()).toBe("2026-11-03T15:00:00.000Z");
    expect(zonedTaskDate("2026-10-04", null, "Europe/Zurich")?.toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(zonedTaskDate("2026-10-04", "16:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-04T10:30:00.000Z");
    expect(() => zonedTaskDate("2026-03-29", "02:30", "Europe/Zurich")).toThrow();
  });
  it("derives the same task IDs for a replayed operation, and never another user's", () => {
    const todos = capture(["parent", "sub task", "child"]);
    const first = prepareTaskRows(todos, "user", "UTC", OP).map((row) => row.id);
    expect(prepareTaskRows(todos, "user", "UTC", OP).map((row) => row.id)).toEqual(first);
    expect(new Set(first).size).toBe(2);
    expect(first[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(rambleTaskId("other", OP, todos[0].id)).not.toBe(first[0]);
    expect(prepareTaskRows(todos, "user", "UTC", "5f9c1a2e-8d3b-4c5a-9e7f-1a2b3c4d5e6f")[0].id).not.toBe(first[0]);
  });
  it("validates the HTTP commit input strictly", () => {
    const todos = capture(["buy milk tomorrow"]);
    expect(rambleCommitInput.safeParse({ operationId: OP, timeZone: "Europe/Zurich", todos }).success).toBe(true);
    for (const bad of [
      { operationId: "not-a-uuid", timeZone: "UTC", todos },
      { operationId: OP, timeZone: "Mars/Olympus", todos },
      { operationId: OP, timeZone: "UTC", todos: [] },
      { operationId: OP, timeZone: "UTC", todos: [{ ...todos[0], userId: "someone" }] },
      { operationId: OP, timeZone: "UTC", todos, userId: "someone" },
    ]) expect(rambleCommitInput.safeParse(bad).success).toBe(false);
  });
});
