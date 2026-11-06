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
  description: string | null;
  /** 1 is highest, 4 is normal — the same scale as the task editor. */
  priority: number;
  /** YYYY-MM-DD; a hard due date, separate from the scheduled dueDate. */
  deadline: string | null;
  labelIds: string[];
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
  | { type: "edit"; todo: RambleTodo }
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

/** A card edited by hand (the quick add card: text, schedule, priority, labels, project); "undo" restores it. Nesting stays. */
export function editStagedTodo(id: string, changes: Partial<Omit<RambleTodo, "id" | "parentId">>, state: RambleSessionState): RambleResult {
  const previous = state.todos.find((todo) => todo.id === id);
  if (!previous) return noop(state, "unknown-todo");
  const title = (changes.title ?? previous.title).trim();
  if (!title) return noop(state, "empty-title");
  const description = changes.description === undefined ? previous.description : changes.description?.trim() || null;
  const todo: RambleTodo = { ...previous, ...changes, id, parentId: previous.parentId, title, description };
  return {
    action: { type: "edit", todo },
    nextState: { ...state, todos: state.todos.map((item) => item.id === id ? todo : item), undoStack: [...state.undoStack, { type: "edit-todo", todoId: id, previous }] },
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
    description: null, priority: 4, deadline: null, labelIds: [],
  };
  const type = mode.mode === "sub-task" ? "create-sub-task" : "create-todo";
  return {
    action: { type, todo },
    nextState: { ...state, ...mode, nextId: state.nextId + 1, todos: [...state.todos, todo],
      undoStack: [...state.undoStack, { type, todoId: todo.id }] },
  };
}

// Local guesses show before the model answers, so a retracted guess is visible
// flicker. Only plain single imperatives qualify; anything the model might
// split, edit, drop or route to a project waits for it.
const LEAD_IN = /^(?:i (?:need|have|got|want) to|i should|i must|we (?:need|have) to|remember to|don'?t forget to|please)\s+/i;
const UNSURE = /\?|[,;]|:(?!\d)|\.\s|\b(?:and|also|then|plus|but|or|actually|instead|wait|no|not|never|don'?t|cancel|scratch|undo|remove|delete|change|make that|move|rename|sub-?\s?task|top level|project|list|done|stop|already|yesterday|ago|earlier|last|um+|uh+|hmm+|like|maybe|might|probably|okay|ok|well|so|hey|hi|hello|thanks?|thank you)\b/i;
const NOT_IMPERATIVE = /^(?:i|we|it|that|this|these|those|the|there|he|she|they|you|my|our|what|why|how|when|where|who|is|are|was|were|do|does|did|can|could|would|should)\b/i;

/** A confident task title for an obvious single-task phrase, otherwise null. */
export function localTaskTitle(text: string): string | null {
  const phrase = text.trim().replace(/[.!]+$/, "").trim().replace(LEAD_IN, "");
  const words = phrase.split(/\s+/).length;
  if (words < 2 || words > 10 || UNSURE.test(phrase) || NOT_IMPERATIVE.test(phrase)) return null;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Stage confident local guesses on top of the confirmed state, in spoken order.
 * Stops at the first phrase that needs the model, so every guessed ID is the
 * one the model's single create would receive and confirmed cards keep their key.
 */
export function previewSegments(state: RambleSessionState, texts: string[]): { state: RambleSessionState; provisionalIds: string[] } {
  const provisionalIds: string[] = [];
  for (const text of texts) {
    const title = localTaskTitle(text);
    if (!title) break;
    const result = interpretSegment(title, state);
    if (result.action.type !== "create-todo" && result.action.type !== "create-sub-task") break;
    state = result.nextState;
    provisionalIds.push(result.action.todo.id);
  }
  return { state, provisionalIds };
}
