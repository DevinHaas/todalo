import { describe, expect, it } from "vitest";
import { createRambleSession, interpretSegment, removeStagedTodo } from "./index";
import { applySemanticOperations, semanticJsonSchema, type SemanticOperation } from "./semantic";

const projects = new Set(["work"]);
function op(fields: Partial<SemanticOperation>): SemanticOperation {
  return { type: "ignore", text: null, targetId: null, parentId: null, dueDate: null, startTime: null,
    endTime: null, projectId: null, recurrence: null, clearFields: [], ...fields };
}
const initial = () => createRambleSession({ referenceDate: new Date("2026-10-03T14:30:00"), projectId: "work" });
const apply = (operations: SemanticOperation[], state = initial()) => applySemanticOperations(operations, state, projects);

describe("validated semantic operations", () => {
  it("ignores filler and splits actions without interpreting titles as commands", () => {
    const state = apply([op({ type: "ignore" }), op({ type: "create", text: "Done" }), op({ type: "create", text: "Call Anna" })]);
    expect(state.todos.map((todo) => todo.title)).toEqual(["Done", "Call Anna"]);
    expect(state.readyToCommit).toBe(false);
  });
  it("edits a date and project without changing title or making another task", () => {
    const before = apply([op({ type: "create", text: "Call Anna" })]);
    const after = apply([op({ type: "edit", targetId: "$last", dueDate: "2026-10-09", startTime: "17:00", clearFields: ["projectId"] })], before);
    expect(after.todos).toHaveLength(1);
    expect(after.todos[0]).toMatchObject({ title: "Call Anna", dueDate: "2026-10-09", startTime: "17:00", projectId: null });
    expect(interpretSegment("undo", after).nextState.todos).toEqual(before.todos);
    expect(before.todos[0].dueDate).toBeNull();
  });
  it("creates children, cascades spoken removal, and undoes removal", () => {
    const state = apply([op({ type: "create", text: "Prepare trip" }), op({ type: "create", text: "Pack", parentId: "$last-root" })]);
    expect(state.todos[1].parentId).toBe(state.todos[0].id);
    const removed = apply([op({ type: "remove", targetId: state.todos[0].id })], state);
    expect(removed.todos).toEqual([]);
    const restored = interpretSegment("undo", removed).nextState;
    expect(restored.todos).toEqual(state.todos);
    expect(interpretSegment("undo", restored).nextState.todos).toHaveLength(1);
  });
  it("keeps the existing sub-task and mode undo grammar", () => {
    const state = apply([op({ type: "create", text: "Parent" }), op({ type: "sub-task" }), op({ type: "create", text: "Child" }), op({ type: "top-level" })]);
    expect(state.mode).toBe("top-level");
    expect(state.todos).toHaveLength(2);
    const undone = apply([op({ type: "undo" })], state);
    expect(undone.mode).toBe("sub-task");
    expect(undone.todos[1].parentId).toBe(undone.todos[0].id);
  });
  it("does not resurrect deleted children after their parent is manually removed", () => {
    const state = apply([op({ type: "create", text: "Parent" }), op({ type: "create", text: "Child", parentId: "$last-root" })]);
    const spoken = apply([op({ type: "remove", targetId: "$last" })], state);
    const manual = removeStagedTodo(state.todos[0].id, spoken).nextState;
    expect(interpretSegment("undo", manual).nextState.todos).toEqual([]);
  });
  it("rejects invented references, foreign projects and nested children atomically", () => {
    const state = initial();
    expect(() => apply([op({ type: "create", text: "Valid" }), op({ type: "create", text: "Invalid", projectId: "foreign" })], state)).toThrow();
    expect(state.todos).toEqual([]);
    expect(() => apply([op({ type: "edit", targetId: "nonexistent", text: "Edit" })])).toThrow();
    expect(() => apply([op({ type: "create", text: "Child", parentId: "$last-root" })])).toThrow();
    const hierarchy = apply([op({ type: "create", text: "Parent" }), op({ type: "create", text: "Child", parentId: "$last-root" })]);
    expect(() => apply([op({ type: "create", text: "Too deep", parentId: "$last" })], hierarchy)).toThrow();
  });
  it("validates calendar dates, time values, recurrence intervals and unknown fields", () => {
    for (const fields of [{ dueDate: "2026-02-30" }, { startTime: "25:00" }, { text: " " }]) {
      expect(() => apply([op({ type: "create", text: "Task", ...fields })])).toThrow();
    }
    expect(() => applySemanticOperations([{ ...op({ type: "create", text: "Task" }), userId: "other-user" }], initial(), projects)).toThrow();
    expect(() => apply([op({ type: "create", text: "Task", recurrence: { n: 0, unit: "day", basedOn: "scheduled", until: null } })])).toThrow();
  });
  it("honors disabled date recognition and clear fields", () => {
    const state = createRambleSession({ referenceDate: new Date("2026-10-03T14:30:00"), smartRecognition: false });
    const result = apply([op({ type: "create", text: "Call Anna tomorrow", dueDate: "2026-10-04", startTime: "17:00" })], state);
    expect(result.todos[0]).toMatchObject({ title: "Call Anna tomorrow", dueDate: null, startTime: null });
  });
  it("rejects changes after an end operation", () => {
    expect(() => apply([op({ type: "end" }), op({ type: "create", text: "Late" })])).toThrow();
  });
  it("uses required nullable fields with closed objects for structured output", () => {
    const schema = semanticJsonSchema as { additionalProperties: boolean; properties: { operations: { items: { required: string[]; additionalProperties: boolean } } } };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.operations.items.additionalProperties).toBe(false);
    expect(schema.properties.operations.items.required).toContain("clearFields");
  });
});
