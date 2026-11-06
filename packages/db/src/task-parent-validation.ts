import { TaskOrganizationError } from "./task-organization-validation";

/**
 * How many ancestors a task may have: a root is depth 0, its sub-task depth 1.
 * The one place the nesting limit lives (server, Ramble commit, importer and
 * client all read it); raise it here to allow deeper trees.
 */
export const MAX_SUBTASK_DEPTH = 3;

export type TaskParentInput = {
  userId: string;
  taskId?: string;
  parentId: string | null;
};

/** `userId` is optional so client copies (DTOs without owners) can be checked too. */
export type TaskParentRecord = {
  id: string;
  userId?: string;
  parentId: string | null;
};

type Tree = { byId: ReadonlyMap<string, TaskParentRecord>; children: ReadonlyMap<string, string[]> };

export function taskTree(tasks: readonly TaskParentRecord[]): Tree {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const children = new Map<string, string[]>();
  for (const task of tasks) if (task.parentId) children.set(task.parentId, [...children.get(task.parentId) ?? [], task.id]);
  return { byId, children };
}

/** Ancestor IDs, nearest first. Stops at a missing parent or a (corrupt) loop. */
export function ancestorIds(id: string, tree: Tree): string[] {
  const chain: string[] = [];
  for (let parent = tree.byId.get(id)?.parentId; parent && !chain.includes(parent) && parent !== id; parent = tree.byId.get(parent)?.parentId) chain.push(parent);
  return chain;
}

/** Levels below the task: 0 for a leaf, 1 with children, 2 with grandchildren. */
export function subtreeHeight(id: string, tree: Tree, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const kids = tree.children.get(id) ?? [];
  return kids.length ? 1 + Math.max(...kids.map(child => subtreeHeight(child, tree, seen))) : 0;
}

/** The task and every descendant (moves carry the whole subtree). */
export function subtreeIds(id: string, tree: Tree): string[] {
  const out = [id];
  for (let index = 0; index < out.length; index++) for (const child of tree.children.get(out[index]!) ?? []) if (!out.includes(child)) out.push(child);
  return out;
}

/**
 * Validates a parent change against the user's tasks (persisted, staged, or
 * the client's copy) with the same rules everywhere: an owned parent, never
 * the task itself or one of its descendants (no cycles), and the moved subtree
 * must still fit within MAX_SUBTASK_DEPTH.
 */
export function validateTaskParent(input: TaskParentInput, tasks: readonly TaskParentRecord[] | Tree): void {
  if (input.parentId === null) return;
  if (input.taskId === input.parentId) throw new TaskOrganizationError("A task cannot be its own parent", "invalid");
  const tree = "byId" in tasks ? tasks : taskTree(tasks);
  const parent = tree.byId.get(input.parentId);
  if (!parent || (parent.userId !== undefined && parent.userId !== input.userId)) throw new TaskOrganizationError("Parent task not found", "missing");
  const above = ancestorIds(parent.id, tree);
  if (input.taskId && above.includes(input.taskId)) throw new TaskOrganizationError("A task cannot be nested under its own sub-task", "invalid");
  const below = input.taskId ? subtreeHeight(input.taskId, tree) : 0;
  if (above.length + 1 + below > MAX_SUBTASK_DEPTH) {
    throw new TaskOrganizationError(`Sub-tasks can be nested at most ${MAX_SUBTASK_DEPTH} levels deep`, "invalid");
  }
}
