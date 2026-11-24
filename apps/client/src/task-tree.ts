import { createContext, useContext, useSyncExternalStore } from "react";
import type { TaskDto } from "./tasks";

/**
 * Every task the signed-in user owns (the Today read, always loaded for the
 * sidebar badge), provided by the dialog host. Rows and the task sheet read
 * sub-tasks and ancestors from it, so no list needs an extra request. Without
 * it (tests, QA) rows show no sub-task indicator.
 */
export const TaskTree = createContext<readonly TaskDto[] | null>(null);
/** Goals ticket 06: task IDs that are milestones (from the goal links; empty while Goals is hidden). Rows show a flag. */
export const MilestoneTasks = createContext<ReadonlySet<string>>(new Set());
/** Ticket 14c: the goal a task serves (its colour and icon on rows and cards); always null while Goals is hidden. */
export interface TaskGoal { id: string; title: string; color: string; icon: string }
export const TaskGoals = createContext<(task: TaskDto) => TaskGoal | null>(() => null);

/** Tasks by ID and children by parent ID, built once per task list (every row of a list shares it). */
const indexes = new WeakMap<readonly TaskDto[], { byId: Map<string, TaskDto>; children: Map<string, TaskDto[]> }>();
const empty: readonly TaskDto[] = [];
export function treeIndex(tasks: readonly TaskDto[] | null) {
  const list = tasks ?? empty;
  let index = indexes.get(list);
  if (!index) {
    index = { byId: new Map(), children: new Map() };
    for (const task of list) {
      index.byId.set(task.id, task);
      if (task.parentId) { const siblings = index.children.get(task.parentId); if (siblings) siblings.push(task); else index.children.set(task.parentId, [task]); }
    }
    indexes.set(list, index);
  }
  return index;
}

/**
 * The same collection as a store (the dialog host sets it after each commit): a row subscribes
 * to its own subtree's summary, so a change elsewhere in the list does not re-render it.
 */
export function taskTreeStore() {
  let tasks: readonly TaskDto[] | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => tasks,
    set(next: readonly TaskDto[] | null) { if (next === tasks) return; tasks = next; for (const listener of listeners) listener(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type TaskTreeStore = ReturnType<typeof taskTreeStore>;
export const TaskTreeStores = createContext<TaskTreeStore | null>(null);
const noStore: TaskTreeStore = taskTreeStore();

/**
 * The tree a row reads: from the store when there is one (re-rendering only when `select`'s
 * string changes), else the TaskTree context. `select` must return a primitive.
 */
export function useTaskTree(select: (tasks: readonly TaskDto[] | null) => string): readonly TaskDto[] | null {
  const store = useContext(TaskTreeStores);
  const context = useContext(store ? TaskTreeStoreless : TaskTree);
  useSyncExternalStore((store ?? noStore).subscribe, () => select((store ?? noStore).get()), () => select(null));
  return store ? store.get() : context;
}
// Read in place of TaskTree when a store is present, so the context's changes don't re-render.
const TaskTreeStoreless = createContext<readonly TaskDto[] | null>(null);

/** Direct children (open, done) and their count. */
export function subtasksOf(id: string, tasks: readonly TaskDto[] | null) {
  const children = treeIndex(tasks).children.get(id) ?? empty;
  const open = children.filter(task => task.status !== "done");
  return { open, done: children.filter(task => task.status === "done"), total: children.length };
}

/** Ancestors, root first (the sheet's breadcrumb). */
export function ancestorsOf(task: TaskDto, tasks: readonly TaskDto[] | null) {
  const { byId } = treeIndex(tasks);
  const chain: TaskDto[] = [];
  for (let parent = task.parentId ? byId.get(task.parentId) : undefined; parent && !chain.includes(parent) && chain.length < 10; parent = parent.parentId ? byId.get(parent.parentId) : undefined) chain.unshift(parent);
  return chain;
}

/** The sheet's sub-task rows: the subtree depth-first, open before done at every level. */
export function subtaskRows(id: string, tasks: readonly TaskDto[] | null, hideCompleted = false, depth = 0, seen = new Set<string>()): { task: TaskDto; depth: number }[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const { open, done } = subtasksOf(id, tasks);
  return [...open, ...(hideCompleted ? [] : done)].flatMap(task => [{ task, depth }, ...subtaskRows(task.id, tasks, hideCompleted, depth + 1, seen)]);
}
