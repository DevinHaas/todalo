import { describe, expect, it, vi } from "vitest";
vi.mock("@todalo/db", () => ({ db: {} }));
import { prepareTaskRows } from "./commit";
import { createRambleSession, interpretSegment } from "@todalo/ramble";
import { zonedTaskDate } from "./dates";

function capture(phrases: string[]) {
  let state = createRambleSession({ referenceDate: new Date("2026-10-03T12:00:00"), projectId: "project" });
  for (const phrase of phrases) state = interpretSegment(phrase, state).nextState;
  return state.todos;
}

describe("atomic commit row preparation", () => {
  it("allocates actual IDs and links children within the same batch", () => {
    const todos = capture(["parent tomorrow at 4pm", "sub task", "child"]);
    const rows = prepareTaskRows(todos, "user", "Europe/Zurich");
    expect(rows[0].id).not.toBe(todos[0].id);
    expect(rows[1].parentId).toBe(rows[0].id);
    expect(rows.every((row) => row.userId === "user")).toBe(true);
    expect(rows[0].dueDate?.toISOString()).toBe("2026-10-04T14:00:00.000Z");
  });
  it("rejects orphan, duplicate, self and deep child references", () => {
    const todos = capture(["parent", "sub task", "child"]);
    expect(() => prepareTaskRows([{ ...todos[1], parentId: "missing" }], "user", "UTC")).toThrow();
    expect(() => prepareTaskRows([todos[0], todos[0]], "user", "UTC")).toThrow();
    expect(() => prepareTaskRows([{ ...todos[0], parentId: todos[0].id }], "user", "UTC")).toThrow();
    expect(() => prepareTaskRows([...todos, { ...todos[1], id: "grandchild", parentId: todos[1].id }], "user", "UTC")).toThrow();
  });
  it("preserves overnight end times and recurrence", () => {
    const rows = prepareTaskRows(capture(["work tomorrow from 23:00 to 01:00 every day"]), "user", "Europe/Zurich");
    expect(rows[0].dueDateEnd!.getTime() - rows[0].dueDate!.getTime()).toBe(2 * 60 * 60 * 1000);
    expect(rows[0].recurrence).toMatchObject({ n: 1, unit: "day" });
  });
  it("resolves future DST, all-day dates and half-hour timezone offsets", () => {
    expect(zonedTaskDate("2026-11-03", "16:00", "Europe/Zurich")?.toISOString()).toBe("2026-11-03T15:00:00.000Z");
    expect(zonedTaskDate("2026-10-04", null, "Europe/Zurich")?.toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(zonedTaskDate("2026-10-04", "16:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-04T10:30:00.000Z");
    expect(() => zonedTaskDate("2026-03-29", "02:30", "Europe/Zurich")).toThrow();
  });
});
