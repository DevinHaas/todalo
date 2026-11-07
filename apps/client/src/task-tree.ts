import { createContext } from "react";
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

/** Direct children (open, done) and their count. */
export function subtasksOf(id: string, tasks: readonly TaskDto[] | null) {
  const children = (tasks ?? []).filter(task => task.parentId === id);
  const open = children.filter(task => task.status !== "done");
  return { open, done: children.filter(task => task.status === "done"), total: children.length };
}

/** Ancestors, root first (the sheet's breadcrumb). */
export function ancestorsOf(task: TaskDto, tasks: readonly TaskDto[] | null) {
  const byId = new Map((tasks ?? []).map(item => [item.id, item]));
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
