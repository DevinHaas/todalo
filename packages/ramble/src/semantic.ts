import { z } from "zod";
import { interpretSegment, removeStagedTodo, type RambleSessionState, type RambleTodo } from "./index";
import { parseQuickAddOrPlain } from "./quick-add";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const recurrence = z.object({
  n: z.number().int().min(1).max(1000), unit: z.enum(["day", "week", "month", "year"]),
  basedOn: z.enum(["scheduled", "completed"]), until: day.nullable(),
}).strict();

// A uniform object keeps strict structured output compatible across providers.
// Null means unchanged/default; clearing an existing field is always explicit.
export const semanticOperationSchema = z.object({
  type: z.enum(["create", "edit", "remove", "ignore", "undo", "sub-task", "top-level", "end"]),
  targetId: z.string().max(100).nullable(),
  text: z.string().max(4000).nullable(),
  parentId: z.string().max(100).nullable(),
  dueDate: day.nullable(), startTime: time.nullable(), endTime: time.nullable(),
  projectId: z.string().max(100).nullable(),
  recurrence: recurrence.nullable(),
  clearFields: z.array(z.enum(["dueDate", "startTime", "endTime", "projectId", "recurrence"])).max(5),
}).strict();
export const semanticResponseSchema = z.object({ operations: z.array(semanticOperationSchema).max(20) }).strict();
export type SemanticOperation = z.infer<typeof semanticOperationSchema>;
export interface SemanticProject { id: string; name: string }
export interface SemanticInput {
  text: string;
  state: RambleSessionState;
  timeZone: string;
  projects: SemanticProject[];
  recentSpeech: string[];
}
export interface SemanticProcessor {
  assertConfigured(): void;
  process(input: SemanticInput, signal: AbortSignal): Promise<SemanticOperation[]>;
}

// Strip local validation refinements for the provider, and remove schema size
// keywords that aren't supported by every strict JSON implementation.
const json = z.toJSONSchema(semanticResponseSchema, { unrepresentable: "any" });
function portableSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(portableSchema);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["$schema", "maxItems", "minItems", "maxLength", "minLength", "pattern", "minimum", "maximum"].includes(key))
    .map(([key, entry]) => [key, portableSchema(entry)]));
  return value;
}
export const semanticJsonSchema = portableSchema(json);

function target(id: string | null, state: RambleSessionState) {
  if (id === "$last") return state.todos.at(-1)?.id ?? null;
  if (id === "$last-root") return [...state.todos].reverse().find((todo) => !todo.parentId)?.id ?? null;
  return id;
}

function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskFields(operation: SemanticOperation, state: RambleSessionState, previous?: RambleTodo): RambleTodo {
  const parsed = operation.text ? parseQuickAddOrPlain(operation.text, state.smartRecognition, new Date(state.referenceDate)) : null;
  const todo: RambleTodo = previous ? { ...previous } : {
    id: `ramble-${state.nextId}`, title: "", parentId: state.mode === "sub-task" ? state.parentId : null,
    dueDate: state.defaultDueDate, startTime: null, endTime: null, projectId: state.projectId, recurrence: null,
  };
  if (operation.text !== null) {
    todo.title = parsed?.strippedTitle.trim() ?? "";
    if (parsed?.dueDate) todo.dueDate = localDay(parsed.dueDate);
    if (parsed?.startTime) todo.startTime = parsed.startTime;
    if (parsed?.endTime) todo.endTime = parsed.endTime;
    if (parsed?.recurrence) todo.recurrence = { ...parsed.recurrence, until: parsed.recurrence.until?.toISOString() ?? null };
  }
  if (state.smartRecognition) {
    if (operation.dueDate !== null) todo.dueDate = operation.dueDate;
    if (operation.startTime !== null) todo.startTime = operation.startTime;
    if (operation.endTime !== null) todo.endTime = operation.endTime;
    if (operation.recurrence !== null) todo.recurrence = { ...operation.recurrence,
      until: operation.recurrence.until ? `${operation.recurrence.until}T00:00:00.000Z` : null };
  }
  if (operation.projectId !== null) todo.projectId = operation.projectId;
  for (const field of operation.clearFields) todo[field] = null;
  if (operation.clearFields.includes("dueDate")) { todo.startTime = null; todo.endTime = null; }
  if (!todo.dueDate && todo.startTime) todo.dueDate = state.referenceDate.slice(0, 10);
  if (todo.endTime && !todo.startTime) throw new Error("An end time requires a start time");
  if (!todo.title || todo.title.length > 4000) throw new Error("Invalid task title");
  return todo;
}

/** Validate and apply the whole model batch immutably, or reject all of it. */
export function applySemanticOperations(input: unknown, initial: RambleSessionState, projectIds: Set<string>): RambleSessionState {
  const { operations } = semanticResponseSchema.parse({ operations: input });
  let state = initial;
  for (const operation of operations) {
    if (state.readyToCommit) throw new Error("Operations after session end are invalid");
    if (operation.projectId && !projectIds.has(operation.projectId)) throw new Error("Unknown project");
    if (operation.type === "ignore") continue;
    if (["undo", "sub-task", "top-level", "end"].includes(operation.type)) {
      const command = operation.type === "end" ? "done" : operation.type === "top-level" ? "top level" : operation.type;
      state = interpretSegment(command, state).nextState;
      continue;
    }
    if (operation.type === "create") {
      if (state.todos.length >= 500) throw new Error("Task limit reached");
      if (operation.text === null) throw new Error("A task needs a title");
      const todo = taskFields(operation, state);
      if (operation.parentId !== null) {
        todo.parentId = target(operation.parentId, state);
        if (!todo.parentId) throw new Error("Unknown sub-task parent");
      }
      if (todo.parentId && !state.todos.some((item) => item.id === todo.parentId && item.parentId === null)) throw new Error("Invalid sub-task parent");
      state = { ...state, nextId: state.nextId + 1, todos: [...state.todos, todo],
        undoStack: [...state.undoStack, { type: todo.parentId ? "create-sub-task" : "create-todo", todoId: todo.id }] };
      continue;
    }
    const id = target(operation.targetId, state);
    const previous = state.todos.find((todo) => todo.id === id);
    if (!previous) throw new Error("Unknown task reference");
    if (operation.type === "remove") {
      const removed = state.todos.filter((todo) => todo.id === id || todo.parentId === id);
      const indices = removed.map((todo) => state.todos.indexOf(todo));
      state = { ...removeStagedTodo(id!, state).nextState, undoStack: [...state.undoStack,
        { type: "delete-todo", removed, indices, previous: { mode: state.mode, parentId: state.parentId } }] };
    } else {
      if (operation.parentId !== null) throw new Error("Existing task parents cannot be changed");
      const todo = taskFields(operation, state, previous);
      if (JSON.stringify(todo) === JSON.stringify(previous)) continue;
      state = { ...state, todos: state.todos.map((item) => item.id === id ? todo : item),
        undoStack: [...state.undoStack, { type: "edit-todo", todoId: previous.id, previous }] };
    }
  }
  return state;
}
