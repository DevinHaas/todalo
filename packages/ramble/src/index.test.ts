import { describe, expect, it } from "vitest";
import { createRambleSession, interpretSegment, removeStagedTodo, type RambleSessionState } from "./index";

const referenceDate = new Date(2026, 9, 3, 23, 45);
const fresh = () => createRambleSession({ referenceDate });
const capture = (state: RambleSessionState, ...segments: string[]) =>
  segments.reduce((current, segment) => interpretSegment(segment, current).nextState, state);

describe("fixed command grammar", () => {
  it.each(["sub-task", "sub task", "subtask", "  SUB   TASK  ", "Sub-task.", "Subtask."])("enters sub-task mode: %s", (phrase) => {
    const before = capture(fresh(), "Plan trip");
    const result = interpretSegment(phrase, before);
    expect(result.action.type).toBe("enter-sub-task");
    expect(result.nextState.parentId).toBe(before.todos[0].id);
    expect(result.nextState.mode).toBe("sub-task");
  });

  it.each(["end sub-task", "end sub task", "end subtask", "back to", "top level", " BACK  TO! "])("exits sub-task mode: %s", (phrase) => {
    const result = interpretSegment(phrase, capture(fresh(), "Plan trip", "sub-task"));
    expect(result.action.type).toBe("exit-sub-task");
    expect(result.nextState).toMatchObject({ mode: "top-level", parentId: null });
  });

  it.each(["remove last", "undo", "scratch that", "  SCRATCH   THAT. "])("undoes most recent capture: %s", (phrase) => {
    const result = interpretSegment(phrase, capture(fresh(), "Plan trip", "Buy adapter"));
    expect(result.action.type).toBe("undo");
    expect(result.nextState.todos.map((todo) => todo.title)).toEqual(["Plan trip"]);
  });

  it.each(["that's all", "stop", "done", " THAT’S   ALL! "])("marks ready for explicit commit: %s", (phrase) => {
    const before = capture(fresh(), "Buy milk");
    const result = interpretSegment(phrase, before);
    expect(result.action.type).toBe("end");
    expect(result.nextState.readyToCommit).toBe(true);
    expect(result.nextState.todos).toEqual(before.todos);
    expect(interpretSegment("Buy bread", result.nextState).action).toEqual({ type: "noop", reason: "session-ended" });
  });

  it.each(["stop smoking", "undo my changes", "back to school", "sub-task planning", "done with homework", "remove the second one"])("only treats a whole segment as command: %s", (title) => {
    const result = interpretSegment(title, fresh());
    expect(result.action.type).toBe("create-todo");
    expect(result.nextState.todos[0].title).toBe(title);
  });

  it("ignores empty transcripts and an empty undo stack", () => {
    for (const phrase of ["", "  ", "...", "undo"]) {
      const state = fresh();
      expect(interpretSegment(phrase, state).nextState).toBe(state);
    }
  });
});

describe("single-level hierarchy and LIFO undo", () => {
  it("cannot enter sub-task mode before a parent exists or nest it twice", () => {
    expect(interpretSegment("sub-task", fresh()).action).toEqual({ type: "noop", reason: "no-parent" });
    const state = capture(fresh(), "Plan trip", "sub-task", "Book flights");
    expect(interpretSegment("sub-task", state).action).toEqual({ type: "noop", reason: "already-in-mode" });
    const next = capture(state, "Buy adapter");
    expect(next.todos.slice(1).map((todo) => todo.parentId)).toEqual([next.todos[0].id, next.todos[0].id]);
  });

  it("selects the most recent top-level parent after exiting mode", () => {
    const state = capture(fresh(), "Plan trip", "sub-task", "Buy adapter", "top level", "Plan party", "sub task", "Buy cake");
    expect(state.todos.map((todo) => [todo.title, todo.parentId])).toEqual([
      ["Plan trip", null], ["Buy adapter", "ramble-1"], ["Plan party", null], ["Buy cake", "ramble-3"],
    ]);
  });

  it("reverses each action in order: top-level item, child, enter, exit", () => {
    let state = capture(fresh(), "Plan trip", "sub-task", "Buy adapter", "top level", "Plan party");
    state = capture(state, "undo");
    expect(state.todos.map((todo) => todo.title)).toEqual(["Plan trip", "Buy adapter"]);
    expect(state.mode).toBe("top-level");
    state = capture(state, "undo");
    expect(state).toMatchObject({ mode: "sub-task", parentId: "ramble-1" });
    state = capture(state, "undo");
    expect(state.todos).toHaveLength(1);
    expect(state.mode).toBe("sub-task");
    state = capture(state, "undo");
    expect(state).toMatchObject({ mode: "top-level", parentId: null });
    state = capture(state, "undo");
    expect(state.todos).toEqual([]);
    expect(state.undoStack).toEqual([]);
  });

  it("keeps ids monotonic after undo so delayed removals cannot target new cards", () => {
    const state = capture(fresh(), "Buy milk", "undo", "Buy bread");
    expect(state.todos[0].id).toBe("ramble-2");
    expect(removeStagedTodo("ramble-1", state).nextState).toBe(state);
  });

  it("does not mutate input state, arrays, cards, or undo history", () => {
    const state = capture(fresh(), "Plan trip", "sub-task", "Buy adapter");
    const serialized = JSON.stringify(state);
    Object.freeze(state);
    Object.freeze(state.todos);
    state.todos.forEach(Object.freeze);
    Object.freeze(state.undoStack);
    interpretSegment("undo", state);
    interpretSegment("Book flights", state);
    removeStagedTodo("ramble-1", state);
    expect(JSON.stringify(state)).toBe(serialized);
  });
});

describe("manual removal", () => {
  it("removes children with parent and makes future captures top-level", () => {
    const before = capture(fresh(), "Plan trip", "sub-task", "Buy adapter", "Book flights");
    const result = removeStagedTodo("ramble-1", before);
    expect(result.action).toEqual({ type: "remove", removedIds: ["ramble-1", "ramble-2", "ramble-3"] });
    expect(result.nextState).toMatchObject({ todos: [], undoStack: [], mode: "top-level", parentId: null });
    const next = capture(result.nextState, "undo", "Plan party");
    expect(next.todos[0]).toMatchObject({ title: "Plan party", parentId: null });
  });

  it("prunes mode undo snapshots referencing a removed parent", () => {
    const before = capture(fresh(), "Plan trip", "sub-task", "Buy adapter", "top level", "Plan party");
    const next = capture(removeStagedTodo("ramble-1", before).nextState, "undo", "undo", "undo", "Buy milk");
    expect(next.todos).toHaveLength(1);
    expect(next.todos[0].parentId).toBeNull();
    expect(next.mode).toBe("top-level");
  });

  it("removes only the chosen child and preserves undo for surviving cards", () => {
    const before = capture(fresh(), "Plan trip", "sub-task", "Buy adapter", "Book flights");
    const removed = removeStagedTodo("ramble-2", before).nextState;
    expect(removed.todos.map((todo) => todo.id)).toEqual(["ramble-1", "ramble-3"]);
    const next = capture(removed, "undo");
    expect(next.todos.map((todo) => todo.id)).toEqual(["ramble-1"]);
    expect(next.mode).toBe("sub-task");
  });
});

describe("quick-add fields on staged cards", () => {
  it("forwards parsed date, full time range, recurrence, project and stripped title to a child", () => {
    const session = createRambleSession({ referenceDate, projectId: "project-trip" });
    const state = capture(session, "Plan trip", "sub-task", "Review itinerary tomorrow from 4pm to 5pm every 2 weeks");
    expect(state.todos[1]).toEqual({
      id: "ramble-2", title: "Review itinerary", parentId: "ramble-1", dueDate: "2026-10-04",
      startTime: "16:00", endTime: "17:00", projectId: "project-trip",
      recurrence: { n: 2, unit: "week", basedOn: "scheduled", until: null },
    });
  });

  it("preserves plain titles when recognition is disabled", () => {
    const state = capture(createRambleSession({ referenceDate, smartRecognition: false }), "Buy milk tomorrow at 4pm");
    expect(state.todos[0]).toMatchObject({ title: "Buy milk tomorrow at 4pm", dueDate: null, startTime: null });
  });

  it("uses day-specific default, lets recognized date override it, and anchors clock-only capture", () => {
    const state = capture(createRambleSession({ referenceDate, defaultDueDate: "2026-10-10" }), "Buy milk", "Buy bread tomorrow", "Call Alex at 4pm");
    expect(state.todos.map((todo) => todo.dueDate)).toEqual(["2026-10-10", "2026-10-04", "2026-10-10"]);
    expect(capture(fresh(), "Call Alex at 4pm").todos[0].dueDate).toBe("2026-10-03");
  });

  it("does not stage an empty title after stripping recognized metadata", () => {
    expect(interpretSegment("tomorrow at 4pm", fresh()).action).toEqual({ type: "noop", reason: "empty-title" });
  });

  it("keeps state JSON serializable and preserves behavior after a round trip", () => {
    const before = capture(fresh(), "Buy milk tomorrow daily", "sub-task");
    const next = capture(JSON.parse(JSON.stringify(before)) as RambleSessionState, "Buy bread tomorrow");
    expect(next.todos[1]).toMatchObject({ parentId: "ramble-1", dueDate: "2026-10-04" });
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });
});
