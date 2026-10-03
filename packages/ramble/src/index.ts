import { parseQuickAddOrPlain } from "./quick-add";
import type { Recurrence } from "./recurrence";

export type RambleMode = "top-level" | "sub-task";

// Only JSON values cross the websocket. Dates carry their recognized local day.
export interface RambleTodo {
  id: string;
  title: string;
  parentId: string | null;
  dueDate: string | null;
  startTime: string | null;
  endTime: string | null;
  recurrence: (Omit<Recurrence, "until"> & { until: string | null }) | null;
  projectId: string | null;
}

export type StagedTodo = RambleTodo;

interface ModeSnapshot {
  mode: RambleMode;
  parentId: string | null;
}

export type RambleUndoEntry =
  | { type: "create-todo" | "create-sub-task"; todoId: string }
  | { type: "edit-todo"; todoId: string; previous: RambleTodo }
  | { type: "delete-todo"; removed: RambleTodo[]; indices: number[]; previous: ModeSnapshot }
  | { type: "enter-sub-task" | "exit-sub-task"; previous: ModeSnapshot; next: ModeSnapshot };

export interface RambleSessionState extends ModeSnapshot {
  todos: RambleTodo[];
  undoStack: RambleUndoEntry[];
  readyToCommit: boolean;
  nextId: number;
  referenceDate: string;
  projectId: string | null;
  defaultDueDate: string | null;
  smartRecognition: boolean;
}

export interface RambleSessionOptions {
  referenceDate?: Date;
  projectId?: string | null;
  defaultDueDate?: string | null;
  smartRecognition?: boolean;
}

export type RambleAction =
  | { type: "create-todo" | "create-sub-task"; todo: RambleTodo }
  | { type: "enter-sub-task" | "exit-sub-task" }
  | { type: "undo"; undone: RambleUndoEntry }
  | { type: "remove"; removedIds: string[] }
  | { type: "end" }
  | { type: "noop"; reason: "empty" | "empty-title" | "empty-undo" | "no-parent" | "already-in-mode" | "session-ended" | "unknown-todo" };

export interface RambleResult {
  action: RambleAction;
  nextState: RambleSessionState;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createRambleSession(options: RambleSessionOptions = {}): RambleSessionState {
  // Save the reference wall clock without an offset: server callers can provide
  // a Date constructed from the client's local fields, independent of host TZ.
  const reference = options.referenceDate ?? new Date();
  if (Number.isNaN(reference.getTime())) throw new Error("Invalid Ramble reference date");
  return {
    mode: "top-level", parentId: null, todos: [], undoStack: [],
    readyToCommit: false, nextId: 1,
    referenceDate: `${localDay(reference)}T${String(reference.getHours()).padStart(2, "0")}:${String(reference.getMinutes()).padStart(2, "0")}:${String(reference.getSeconds()).padStart(2, "0")}`,
    projectId: options.projectId ?? null,
    defaultDueDate: options.defaultDueDate ?? null,
    smartRecognition: options.smartRecognition ?? true,
  };
}

function commandPhrase(text: string): string {
  return text.trim().toLowerCase().replace(/[’‘]/g, "'")
    .replace(/[.!?,;:]+$/g, "").trim().replace(/\s+/g, " ");
}

function noop(state: RambleSessionState, reason: Extract<RambleAction, { type: "noop" }>["reason"]): RambleResult {
  return { action: { type: "noop", reason }, nextState: state };
}

function validMode(snapshot: ModeSnapshot, todos: RambleTodo[]): ModeSnapshot {
  if (snapshot.mode === "sub-task" && todos.some((todo) => todo.id === snapshot.parentId && todo.parentId === null)) {
    return { mode: "sub-task", parentId: snapshot.parentId };
  }
  return { mode: "top-level", parentId: null };
}

/** Remove a card and its children; stale undo entries cannot resurrect them. */
export function removeStagedTodo(id: string, state: RambleSessionState): RambleResult {
  if (!state.todos.some((todo) => todo.id === id)) return noop(state, "unknown-todo");
  const removedIds = state.todos.filter((todo) => todo.id === id || todo.parentId === id).map((todo) => todo.id);
  const removed = new Set(removedIds);
  const todos = state.todos.filter((todo) => !removed.has(todo.id));
  const undoStack = state.undoStack.flatMap((entry): RambleUndoEntry[] => {
    if ("todoId" in entry) return removed.has(entry.todoId) ? [] : [entry];
    if (entry.type === "delete-todo") {
      return entry.removed.some((todo) => removed.has(todo.id) || (todo.parentId && removed.has(todo.parentId))) ? [] : [entry];
    }
    // Mode changes involving a deleted parent no longer have a useful inverse.
    if ((entry.previous.parentId && removed.has(entry.previous.parentId)) ||
        (entry.next.parentId && removed.has(entry.next.parentId))) return [];
    return [entry];
  });
  return {
    action: { type: "remove", removedIds },
    nextState: { ...state, ...validMode(state, todos), todos, undoStack },
  };
}

/** One finalized transcript segment produces exactly one immutable action. */
export function interpretSegment(text: string, state: RambleSessionState): RambleResult {
  if (state.readyToCommit) return noop(state, "session-ended");
  const phrase = commandPhrase(text);
  if (!phrase) return noop(state, "empty");

  if (["that's all", "stop", "done"].includes(phrase)) {
    return { action: { type: "end" }, nextState: { ...state, readyToCommit: true } };
  }
  if (["remove last", "undo", "scratch that"].includes(phrase)) {
    const undone = state.undoStack.at(-1);
    if (!undone) return noop(state, "empty-undo");
    let nextState = { ...state, undoStack: state.undoStack.slice(0, -1) };
    if (undone.type === "edit-todo") {
      nextState = { ...nextState, todos: nextState.todos.map((todo) => todo.id === undone.todoId ? undone.previous : todo) };
    } else if (undone.type === "delete-todo") {
      const todos = [...nextState.todos];
      undone.removed.forEach((todo, index) => todos.splice(undone.indices[index], 0, todo));
      nextState = { ...nextState, ...validMode(undone.previous, todos), todos };
    } else if ("todoId" in undone) {
      nextState = removeStagedTodo(undone.todoId, nextState).nextState;
    } else {
      nextState = { ...nextState, ...validMode(undone.previous, nextState.todos) };
    }
    return { action: { type: "undo", undone }, nextState };
  }
  if (["sub-task", "sub task", "subtask"].includes(phrase)) {
    if (state.mode === "sub-task") return noop(state, "already-in-mode");
    const parent = [...state.todos].reverse().find((todo) => todo.parentId === null);
    if (!parent) return noop(state, "no-parent");
    return {
      action: { type: "enter-sub-task" },
      nextState: { ...state, mode: "sub-task", parentId: parent.id,
        undoStack: [...state.undoStack, { type: "enter-sub-task", previous: { mode: state.mode, parentId: state.parentId }, next: { mode: "sub-task", parentId: parent.id } }] },
    };
  }
  if (["end sub-task", "end sub task", "end subtask", "back to", "top level"].includes(phrase)) {
    if (state.mode === "top-level") return noop(state, "already-in-mode");
    return {
      action: { type: "exit-sub-task" },
      nextState: { ...state, mode: "top-level", parentId: null,
        undoStack: [...state.undoStack, { type: "exit-sub-task", previous: { mode: state.mode, parentId: state.parentId }, next: { mode: "top-level", parentId: null } }] },
    };
  }

  const parsed = parseQuickAddOrPlain(text.trim(), state.smartRecognition, new Date(state.referenceDate));
  if (!parsed.strippedTitle) return noop(state, "empty-title");
  const mode = validMode(state, state.todos);
  const todo: RambleTodo = {
    id: `ramble-${state.nextId}`, title: parsed.strippedTitle,
    parentId: mode.parentId,
    dueDate: parsed.dueDate ? localDay(parsed.dueDate) : (state.defaultDueDate ?? (parsed.startTime ? state.referenceDate.slice(0, 10) : null)),
    startTime: parsed.startTime, endTime: parsed.endTime,
    recurrence: parsed.recurrence ? { ...parsed.recurrence, until: parsed.recurrence.until?.toISOString() ?? null } : null,
    projectId: state.projectId,
  };
  const type = mode.mode === "sub-task" ? "create-sub-task" : "create-todo";
  return {
    action: { type, todo },
    nextState: { ...state, ...mode, nextId: state.nextId + 1, todos: [...state.todos, todo],
      undoStack: [...state.undoStack, { type, todoId: todo.id }] },
  };
}
