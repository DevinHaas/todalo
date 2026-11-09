import { invoke, isTauri } from "@tauri-apps/api/core";
import type { MutationOptions, QueryClient, QueryFilters } from "@tanstack/react-query";
import { optimistic, type Write } from "./optimistic";
import { planReorder, type BulkCompletionDto, type BulkMetadataChange, type ReorderInput, type ReorderPosition, type TaskStatus } from "../../../packages/server/src/bulk-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import { horizonNames, operationId as newOperationId, taskChanges, taskKeys, treeOrder, type TaskDto } from "./tasks";
import type { Feedback } from "./feedback";
import { confirmingCriteria } from "./goals";

export type { BulkCompletionDto, BulkMetadataChange, ReorderInput, ReorderPosition, TaskStatus };
export type Destination = { projectId: string | null; sectionId: string | null };

/** Ticket 15 writes. null/false: some selected task (or the destination) is missing or another user's; nothing was written. */
export interface BulkTransport {
  /** CRITERIA_OPEN: some task is a milestone with open done criteria, unless `confirmCriteria` (nothing was written). */
  complete(tasks: { id: string; occurrence: string | null }[], operationId: string, confirmCriteria?: boolean): Promise<BulkCompletionDto | null>;
  remove(ids: string[]): Promise<boolean>;
  clearDates(ids: string[]): Promise<boolean>;
  metadata(ids: string[], change: BulkMetadataChange): Promise<boolean>;
  move(ids: string[], destination: Destination): Promise<boolean>;
  reorder(id: string, move: ReorderInput): Promise<boolean>;
}

export function browserBulkTransport(fetcher: typeof fetch = fetch): BulkTransport {
  async function post<T>(path: string, body: unknown): Promise<T | null> {
    let response: Response;
    try {
      // Same-origin cookie session; the API also checks Origin on writes.
      response = await fetcher(path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (response.status === 428) throw new AccountTransportError("CRITERIA_OPEN");
    if (!response.ok) throw new AccountTransportError("SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const done = async (result: Promise<unknown>) => (await result) !== null;
  return {
    complete: (tasks, operationId, confirmCriteria) => post<BulkCompletionDto>("/api/v1/bulk/complete", { operationId, tasks, ...(confirmCriteria && { confirmCriteria }) }),
    remove: (ids) => done(post("/api/v1/bulk/delete", { ids })),
    clearDates: (ids) => done(post("/api/v1/bulk/clear-date", { ids })),
    metadata: (ids, change) => done(post("/api/v1/bulk/metadata", { ids, ...change })),
    move: (ids, destination) => done(post("/api/v1/bulk/move", { ids, ...destination })),
    reorder: (id, move) => done(post(`/api/v1/tasks/${encodeURIComponent(id)}/reorder`, move)),
  };
}

export function bulkTransport(): BulkTransport {
  if (!isTauri()) return browserBulkTransport();
  const command = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  const done = async (result: Promise<unknown>) => (await result) !== null;
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    complete: (tasks, operationId, confirmCriteria) => command<BulkCompletionDto | null>("bulk_complete", { tasks, operationId, ...(confirmCriteria && { confirmCriteria }) }),
    remove: (ids) => done(command("bulk_delete", { ids })),
    clearDates: (ids) => done(command("bulk_clear_date", { ids })),
    metadata: (ids, change) => done(command("bulk_metadata", { ids, change })),
    move: (ids, { projectId, sectionId }) => done(command("bulk_move", { ids, projectId, sectionId })),
    reorder: (id, move) => done(command("reorder_task", { id, ...move })),
  };
}

/**
 * Where a dragged row lands: next to a sibling, or (a top-level task dropped on
 * a sub-task) next to that sub-task's parent, since sub-tasks follow their
 * parent. A sub-task cannot leave its parent by dragging (use Move or Unnest).
 */
export function reorderAnchor(tasks: TaskDto[], id: string, overId: string): string | null {
  const task = tasks.find(item => item.id === id);
  const over = tasks.find(item => item.id === overId);
  if (!task || !over || task.id === over.id) return null;
  if (over.parentId === task.parentId) return over.id;
  return task.parentId === null && over.parentId !== task.id ? over.parentId : null;
}

/** Legacy BoardView columns (ticket 17). */
export const boardColumns = [{ status: "todo", label: "To do" }, { status: "in_progress", label: "In progress" }, { status: "done", label: "Done" }] as const satisfies readonly { status: TaskStatus; label: string }[];
/** Droppable ID of a column; card IDs are task IDs. */
export const columnId = (status: TaskStatus) => `column:${status}`;

/**
 * A board drop as a reorder command. Another column, or a card in it, sets that
 * status and appends (legacy BoardView); a card in the same column places the
 * task next to it (same rules as the list, and only within one collection,
 * since Today and Upcoming boards mix projects). null: nothing to write.
 */
export function boardDrop(tasks: TaskDto[], id: string, overId: string): ReorderInput | null {
  const task = tasks.find(item => item.id === id);
  const over = tasks.find(item => item.id === overId);
  const status = over?.status ?? boardColumns.find(column => columnId(column.status) === overId)?.status;
  if (!task || !status) return null;
  if (status !== task.status) return { status };
  if (!over) return null;
  const column = treeOrder(tasks.filter(item => item.status === status));
  const anchor = column.find(item => item.id === reorderAnchor(column, id, over.id));
  if (!anchor || anchor.projectId !== task.projectId) return null;
  return { anchorId: anchor.id, position: column.indexOf(task) < column.indexOf(over) ? "after" : "before" };
}

/** The project page's tasks after the move, in the server's terms (planReorder; no anchor appends). */
export function reorderTasks(tasks: TaskDto[], id: string, anchorId: string | null, position?: ReorderPosition): TaskDto[] {
  const order = planReorder(tasks.map(task => task.id), id, anchorId, position);
  return order ? order.map(taskId => tasks.find(task => task.id === taskId)!) : tasks;
}

export interface BulkSelection { tasks: TaskDto[] }
export interface BulkCompletion extends BulkSelection { operationId: string }
/** Next to an anchor and/or into a status board column (no anchor: appended). */
export type Reorder = { task: TaskDto } & ReorderInput;

// Same retry rule as task writes: only failures that may hide an applied write.
// Each bulk write is safe to repeat (one tap ID per completion; the others set
// the same values again); a repeated delete finds the tasks gone.
const ambiguous = (error: unknown) => error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED");
const retry = (failures: number, error: unknown) => failures < 2 && ambiguous(error);
const retryDelay = (failures: number) => 300 * 2 ** failures;
const ids = ({ tasks }: BulkSelection) => tasks.map(task => task.id);

/** "Buy milk" for one task, "3 tasks" for more. */
export const selectionName = ({ tasks }: BulkSelection) => tasks.length === 1 ? `"${tasks[0]!.title}"` : `${tasks.length} tasks`;
const priorityName = (change: BulkMetadataChange, selection: BulkSelection) =>
  change.priority !== undefined ? `set ${selectionName(selection)} to priority ${change.priority}`
    // Goals ticket 31.
    : change.horizon !== undefined ? `move ${selectionName(selection)} to ${change.horizon ? horizonNames[change.horizon] : "unsorted"}`
    : change.labelIds !== undefined ? `change the labels of ${selectionName(selection)}` : `change the deadline of ${selectionName(selection)}`;

/**
 * Bulk writes and reorder (row drag, board moves), all optimistic
 * (optimistic.ts) on every task list: completion, deletion, clear-date,
 * priority/labels/deadline, move and reorder show at once, and a failure takes
 * back only its own change with a toast (meta.action). Reads then refresh: bulk
 * moves carry sub-tasks; labels feed label and filter lists; a confirmed
 * completion ticks goal criteria.
 */
export function bulkMutations(transport: BulkTransport, cache: QueryClient, userId: string, feedback?: Feedback) {
  const user = taskKeys.user(userId);
  const refresh = (): QueryFilters[] => [
    { queryKey: taskKeys.today(userId) }, { queryKey: [...user, "task"] }, { queryKey: [...user, "project"] },
    { queryKey: [...user, "metadata"] }, { queryKey: [...user, "search"] }, { queryKey: [...user, "goals"] },
  ];
  const lists = <V,>(change: (input: V) => (tasks: TaskDto[]) => TaskDto[]) => optimistic<V>(cache, { apply: (input) => taskChanges(userId, change(input)), refresh });
  // A 404 means some selected task is gone or not the user's: nothing changed.
  const written = (done: boolean) => { if (!done) throw new AccountTransportError("TASK_NOT_FOUND"); };
  // A retried delete that finds everything gone was applied by the lost attempt.
  const attempts = new WeakMap<object, number>();
  const only = (selection: BulkSelection) => (tasks: TaskDto[]) => tasks.filter(task => !selection.tasks.some(selected => selected.id === task.id || selected.id === task.parentId));
  const matching = (selection: BulkSelection, patch: Partial<TaskDto>) => (tasks: TaskDto[]) => tasks.map(task => selection.tasks.some(selected => selected.id === task.id) ? { ...task, ...patch } : task);
  const completed = lists<BulkCompletion>(selection => matching(selection, { status: "done", completedAt: new Date().toISOString() }));
  return {
    complete: {
      mutationFn: async (selection: BulkCompletion) => {
        const result = await confirmingCriteria(confirm => transport.complete(selection.tasks.map(task => ({ id: task.id, occurrence: task.dueDate })), selection.operationId, confirm));
        if (!result) throw new AccountTransportError("TASK_NOT_FOUND");
        return result;
      },
      retry, retryDelay,
      ...completed,
      onMutate: (selection: BulkCompletion) => { feedback?.play("taskCompleted"); return completed.onMutate(selection); },
      meta: { action: (selection: BulkCompletion) => `complete ${selectionName(selection)}` },
    } satisfies MutationOptions<BulkCompletionDto, Error, BulkCompletion, Write>,
    remove: {
      mutationFn: async (selection: BulkSelection) => {
        const attempt = (attempts.get(selection) ?? 0) + 1;
        attempts.set(selection, attempt);
        const done = await transport.remove(ids(selection));
        if (attempt === 1) written(done);
        return true;
      },
      retry, retryDelay,
      ...lists<BulkSelection>(only),
      meta: { action: (selection: BulkSelection) => `delete ${selectionName(selection)}` },
    } satisfies MutationOptions<boolean, Error, BulkSelection, Write>,
    clearDates: {
      mutationFn: async (selection: BulkSelection) => written(await transport.clearDates(ids(selection))),
      retry, retryDelay,
      ...lists<BulkSelection>(selection => matching(selection, { dueDate: null, dueDateEnd: null })),
      meta: { action: (selection: BulkSelection) => `clear the date of ${selectionName(selection)}` },
    } satisfies MutationOptions<void, Error, BulkSelection, Write>,
    metadata: {
      mutationFn: async ({ tasks, change }: BulkSelection & { change: BulkMetadataChange }) => written(await transport.metadata(tasks.map(task => task.id), change)),
      retry, retryDelay,
      ...lists<BulkSelection & { change: BulkMetadataChange }>(({ change, ...selection }) => matching(selection, change)),
      meta: { action: ({ change, ...selection }: BulkSelection & { change: BulkMetadataChange }) => priorityName(change, selection) },
    } satisfies MutationOptions<void, Error, BulkSelection & { change: BulkMetadataChange }, Write>,
    move: {
      mutationFn: async ({ tasks, destination }: BulkSelection & { destination: Destination }) => written(await transport.move(tasks.map(task => task.id), destination)),
      retry, retryDelay,
      ...lists<BulkSelection & { destination: Destination }>(({ destination, ...selection }) => matching(selection, destination)),
      meta: { action: (selection: BulkSelection) => `move ${selectionName(selection)}` },
    } satisfies MutationOptions<void, Error, BulkSelection & { destination: Destination }, Write>,
    reorder: {
      // A drop into Done of a milestone with open criteria asks first; Cancel rolls the card back to its column.
      mutationFn: async ({ task, ...move }: Reorder) => written(await confirmingCriteria(confirm => transport.reorder(task.id, confirm ? { ...move, confirmCriteria: true } : move))),
      retry, retryDelay,
      // Every list: the row moves (to the end for a board column) and takes the status.
      ...lists<Reorder>(({ task, anchorId, position, status }) => tasks => reorderTasks(status ? matching({ tasks: [task] }, { status })(tasks) : tasks, task.id, anchorId ?? null, position)),
      meta: { action: ({ task, status }: Reorder) => status ? `move "${task.title}" to ${statusNames[status]}` : `move "${task.title}"` },
    } satisfies MutationOptions<void, Error, Reorder, Write>,
  };
}
const statusNames: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

/** One tap ID per bulk completion, reused by that tap's retries. */
export const completion = (tasks: TaskDto[]): BulkCompletion => ({ tasks, operationId: newOperationId() });
