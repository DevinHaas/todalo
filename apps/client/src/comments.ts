import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type MutationOptions, type QueryClient, type QueryFilters } from "@tanstack/react-query";
import { change, optimistic, type Write } from "./optimistic";
import type { CommentDto } from "../../../packages/server/src/comment-dto";
import { AccountTransportError, nativeAccountError } from "./errors";
import { taskKeys } from "./tasks";

export type { CommentDto };

export interface CommentTransport {
  /** null when the task is missing or not the signed-in user's. */
  list(taskId: string): Promise<CommentDto[] | null>;
  /** null when the task is missing or not the user's. `id` makes a retry safe. */
  add(taskId: string, id: string, body: string): Promise<CommentDto | null>;
  /** false when the comment is already gone. */
  remove(id: string): Promise<boolean>;
}

export function browserCommentTransport(fetcher: typeof fetch = fetch): CommentTransport {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    let response: Response;
    try {
      // Same-origin cookie session; the API also checks Origin on writes.
      response = await fetcher(path, {
        method, credentials: "same-origin", cache: "no-store",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch { throw new AccountTransportError("CONNECTION_FAILED"); }
    if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
    if (response.status === 404) return null;
    if (response.status === 400) throw new AccountTransportError("INVALID_INPUT");
    if (!response.ok) throw new AccountTransportError(method === "GET" ? "TASKS_UNAVAILABLE" : "SAVE_FAILED");
    try { return await response.json() as T; }
    catch { throw new AccountTransportError("INVALID_RESPONSE"); }
  }
  return {
    list: async (taskId) => (await request<{ comments: CommentDto[] }>("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`))?.comments ?? null,
    add: async (taskId, id, body) => (await request<{ comment: CommentDto }>("POST", `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`, { id, body }))?.comment ?? null,
    remove: async (id) => (await request<{ id: string }>("DELETE", `/api/v1/comments/${encodeURIComponent(id)}`)) !== null,
  };
}

export function commentTransport(): CommentTransport {
  if (!isTauri()) return browserCommentTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    list: async (taskId) => (await command<{ comments: CommentDto[] } | null>("comments", { id: taskId }))?.comments ?? null,
    add: async (taskId, id, body) => (await command<{ comment: CommentDto } | null>("add_comment", { taskId, id, body }))?.comment ?? null,
    remove: async (id) => (await command<{ id: string } | null>("delete_comment", { id })) !== null,
  };
}

export const commentKeys = {
  // Under the task key, so invalidating a task also refreshes its comments.
  task: (userId: string, taskId: string) => [...taskKeys.task(userId, taskId), "comments"] as const,
};

export const commentQueries = (transport: CommentTransport) => ({
  task: (userId: string, taskId: string) => queryOptions({ queryKey: commentKeys.task(userId, taskId), queryFn: () => transport.list(taskId) }),
});

/** `id`: the operation ID, reused by that add's retries. */
export interface NewComment { taskId: string; body: string; id: string }
export interface RemovedComment { taskId: string; id: string }

// An add carries its operation ID and a delete is idempotent, so unclear failures may be repeated.
const retry = (failures: number, error: unknown) => failures < 2 && error instanceof AccountTransportError && (error.code === "CONNECTION_FAILED" || error.code === "SAVE_FAILED");

/**
 * Comment writes, optimistic (optimistic.ts): the comment appears or goes at
 * once and a failure takes back only that change. Each then refreshes the
 * task's comments and the lists' comment counts.
 */
export function commentMutations(transport: CommentTransport, cache: QueryClient, userId: string) {
  const changed = (taskId: string): QueryFilters[] => [{ queryKey: commentKeys.task(userId, taskId) }, { queryKey: taskKeys.today(userId) }, { queryKey: [...taskKeys.user(userId), "project"] }];
  const comments = (taskId: string, edit: (list: CommentDto[]) => CommentDto[]) => change<CommentDto[] | null | undefined>(commentKeys.task(userId, taskId), list => list && edit(list));
  return {
    add: {
      mutationFn: async ({ taskId, body, id }: NewComment) => {
        const comment = await transport.add(taskId, id, body);
        if (!comment) throw new AccountTransportError("TASK_NOT_FOUND");
        return comment;
      },
      retry,
      ...optimistic<NewComment, CommentDto>(cache, {
        // ponytail: "You" until the server's copy (with the author's name) arrives a moment later.
        apply: ({ taskId, body, id }) => [comments(taskId, list => list.some(item => item.id === id) ? list : [...list, { id, taskId, body, createdAt: new Date().toISOString(), author: { name: "You", image: null } }])],
        reconcile: (comment) => [comments(comment.taskId, list => list.map(item => item.id === comment.id ? comment : item))],
        refresh: ({ taskId }) => changed(taskId),
      }),
      meta: { action: () => "add your comment" },
    } satisfies MutationOptions<CommentDto, Error, NewComment, Write>,
    remove: {
      mutationFn: ({ id }: RemovedComment) => transport.remove(id),
      retry,
      ...optimistic<RemovedComment>(cache, { apply: ({ taskId, id }) => [comments(taskId, list => list.filter(item => item.id !== id))], refresh: ({ taskId }) => changed(taskId) }),
      meta: { action: () => "delete the comment" },
    } satisfies MutationOptions<boolean, Error, RemovedComment, Write>,
  };
}
