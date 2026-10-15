import { invoke, isTauri } from "@tauri-apps/api/core";
import type { MutationOptions, QueryClient } from "@tanstack/react-query";
import { planReorder, type BulkCompletionDto, type BulkMetadataChange, type ReorderPosition } from "../../../packages/server/src/bulk-input";
import { AccountTransportError, nativeAccountError } from "./errors";
import { operationId as newOperationId, taskKeys, type TaskDto, type TodayDto } from "./tasks";
import type { ProjectDetailDto } from "./projects";
import type { Feedback } from "./feedback";

export type { BulkCompletionDto, BulkMetadataChange, ReorderPosition };
export type Destination = { projectId: string | null; sectionId: string | null };

/** Ticket 15 writes. null/false: some selected task (or the destination) is missing or another user's; nothing was written. */
export interface BulkTransport {
  complete(tasks: { id: string; occurrence: string | null }[], operationId: string): Promise<BulkCompletionDto | null>;
  remove(ids: string[]): Promise<boolean>;
  clearDates(ids: string[]): Promise<boolean>;
  metadata(ids: string[], change: BulkMetadataChange): Promise<boolean>;
  move(ids: string[], destination: Destination): Promise<boolean>;
  reorder(id: string, anchorId: string, position: ReorderPosition): Promise<boolean>;
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
    if (!response.ok) throw new AccountTransportError("SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  const done = async (result: Promise<unknown>) => (await result) !== null;
  return {
    complete: (tasks, operationId) => post<BulkCompletionDto>("/api/v1/bulk/complete", { operationId, tasks }),
    remove: (ids) => done(post("/api/v1/bulk/delete", { ids })),
    clearDates: (ids) => done(post("/api/v1/bulk/clear-date", { ids })),
    metadata: (ids, change) => done(post("/api/v1/bulk/metadata", { ids, ...change })),
    move: (ids, destination) => done(post("/api/v1/bulk/move", { ids, ...destination })),
    reorder: (id, anchorId, position) => done(post(`/api/v1/tasks/${encodeURIComponent(id)}/reorder`, { anchorId, position })),
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
    complete: (tasks, operationId) => command<BulkCompletionDto | null>("bulk_complete", { tasks, operationId }),
    remove: (ids) => done(command("bulk_delete", { ids })),
    clearDates: (ids) => done(command("bulk_clear_date", { ids })),
    metadata: (ids, change) => done(command("bulk_metadata", { ids, change })),
    move: (ids, { projectId, sectionId }) => done(command("bulk_move", { ids, projectId, sectionId })),
    reorder: (id, anchorId, position) => done(command("reorder_task", { id, anchorId, position })),
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

/** The project page's tasks after the move, in the server's terms (planReorder). */
export function reorderTasks(tasks: TaskDto[], id: string, anchorId: string, position: ReorderPosition): TaskDto[] {
  const order = planReorder(tasks.map(task => task.id), id, anchorId, position);
  return order ? order.map(taskId => tasks.find(task => task.id === taskId)!) : tasks;
}

export interface BulkSelection { tasks: TaskDto[] }
export interface BulkCompletion extends BulkSelection { operationId: string }
export interface Reorder { task: TaskDto; anchorId: string; position: ReorderPosition }

// Same retry rule as task writes: only failures that may hide an applied write.
// Each bulk write is safe to repeat (one tap ID per completion; the others set
// the same values again); a repeated delete finds the tasks gone.
const ambiguous = (error: unknown) => error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED");
const retry = (failures: number, error: unknown) => failures < 2 && ambiguous(error);
const retryDelay = (failures: number) => 300 * 2 ** failures;
const ids = ({ tasks }: BulkSelection) => tasks.map(task => task.id);

type Snapshot = { entries: [readonly unknown[], unknown][] };

/**
 * Bulk writes and reorder against the user's cache. Completion, deletion and
 * clear-date apply optimistically to Today and every open project list and roll
 * back on failure; reorder moves the row in the project list. Every write then
 * refreshes Today, every task, project and metadata read (bulk moves carry
 * sub-tasks; labels feed label and filter lists). Metadata and move wait for the
 * server, as the legacy dialogs did.
 */
export function bulkMutations(transport: BulkTransport, cache: QueryClient, userId: string, feedback?: Feedback) {
  const user = taskKeys.user(userId);
  const projects = [...user, "project"] as const;
  const settle = () => Promise.all([
    cache.invalidateQueries({ queryKey: taskKeys.today(userId) }),
    cache.invalidateQueries({ queryKey: [...user, "task"] }),
    cache.invalidateQueries({ queryKey: projects }),
    cache.invalidateQueries({ queryKey: [...user, "metadata"] }),
  ]);
  async function optimistic(change: (tasks: TaskDto[]) => TaskDto[]): Promise<Snapshot> {
    await Promise.all([cache.cancelQueries({ queryKey: taskKeys.today(userId) }), cache.cancelQueries({ queryKey: projects })]);
    const entries: Snapshot["entries"] = [];
    const apply = <T extends { tasks: TaskDto[] }>(key: readonly unknown[], data: T | null | undefined) => {
      if (!data?.tasks) return;
      entries.push([key, data]);
      cache.setQueryData<T>(key, { ...data, tasks: change(data.tasks) });
    };
    apply<TodayDto>(taskKeys.today(userId), cache.getQueryData<TodayDto>(taskKeys.today(userId)));
    for (const [key, data] of cache.getQueriesData<ProjectDetailDto | null>({ queryKey: projects })) apply(key, data);
    return { entries };
  }
  const rollback = (_error: Error, _input: unknown, snapshot?: Snapshot) => { for (const [key, data] of snapshot?.entries ?? []) cache.setQueryData(key, data); };
  // A 404 means some selected task is gone or not the user's: nothing changed.
  const written = (done: boolean) => { if (!done) throw new AccountTransportError("TASK_NOT_FOUND"); };
  // A retried delete that finds everything gone was applied by the lost attempt.
  const attempts = new WeakMap<object, number>();
  const only = (selection: BulkSelection) => (tasks: TaskDto[]) => tasks.filter(task => !selection.tasks.some(selected => selected.id === task.id));
  const matching = (selection: BulkSelection, patch: Partial<TaskDto>) => (tasks: TaskDto[]) => tasks.map(task => selection.tasks.some(selected => selected.id === task.id) ? { ...task, ...patch } : task);
  return {
    complete: {
      mutationFn: async (selection: BulkCompletion) => {
        const result = await transport.complete(selection.tasks.map(task => ({ id: task.id, occurrence: task.dueDate })), selection.operationId);
        if (!result) throw new AccountTransportError("TASK_NOT_FOUND");
        return result;
      },
      retry, retryDelay,
      onMutate: (selection: BulkCompletion) => {
        feedback?.play("taskCompleted");
        return optimistic(matching(selection, { status: "done", completedAt: new Date().toISOString() }));
      },
      onError: rollback,
      onSettled: settle,
    } satisfies MutationOptions<BulkCompletionDto, Error, BulkCompletion, Snapshot>,
    remove: {
      mutationFn: async (selection: BulkSelection) => {
        const attempt = (attempts.get(selection) ?? 0) + 1;
        attempts.set(selection, attempt);
        const done = await transport.remove(ids(selection));
        if (attempt === 1) written(done);
        return true;
      },
      retry, retryDelay,
      onMutate: (selection: BulkSelection) => optimistic(only(selection)),
      onError: rollback,
      onSettled: settle,
    } satisfies MutationOptions<boolean, Error, BulkSelection, Snapshot>,
    clearDates: {
      mutationFn: async (selection: BulkSelection) => written(await transport.clearDates(ids(selection))),
      retry, retryDelay,
      onMutate: (selection: BulkSelection) => optimistic(matching(selection, { dueDate: null, dueDateEnd: null })),
      onError: rollback,
      onSettled: settle,
    } satisfies MutationOptions<void, Error, BulkSelection, Snapshot>,
    metadata: {
      mutationFn: async ({ tasks, change }: BulkSelection & { change: BulkMetadataChange }) => written(await transport.metadata(tasks.map(task => task.id), change)),
      retry, retryDelay,
      onSettled: settle,
    } satisfies MutationOptions<void, Error, BulkSelection & { change: BulkMetadataChange }>,
    move: {
      mutationFn: async ({ tasks, destination }: BulkSelection & { destination: Destination }) => written(await transport.move(tasks.map(task => task.id), destination)),
      retry, retryDelay,
      onSettled: settle,
    } satisfies MutationOptions<void, Error, BulkSelection & { destination: Destination }>,
    reorder: {
      mutationFn: async ({ task, anchorId, position }: Reorder) => written(await transport.reorder(task.id, anchorId, position)),
      retry, retryDelay,
      onMutate: async ({ task, anchorId, position }: Reorder) => {
        await cache.cancelQueries({ queryKey: projects });
        const entries: Snapshot["entries"] = [];
        for (const [key, data] of cache.getQueriesData<ProjectDetailDto | null>({ queryKey: projects })) {
          if (!data?.tasks?.some(item => item.id === task.id)) continue;
          entries.push([key, data]);
          cache.setQueryData<ProjectDetailDto>(key, { ...data, tasks: reorderTasks(data.tasks, task.id, anchorId, position) });
        }
        return { entries };
      },
      onError: rollback,
      onSettled: settle,
    } satisfies MutationOptions<void, Error, Reorder, Snapshot>,
  };
}

/** One tap ID per bulk completion, reused by that tap's retries. */
export const completion = (tasks: TaskDto[]): BulkCompletion => ({ tasks, operationId: newOperationId() });
