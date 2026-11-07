// Time blocks (goals ticket 07): reserved time on the schedule with an optional goal.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { TimeBlockDto, TimeBlocksDto } from "../../../packages/server/src/time-block-dto";
import { AccountTransportError, nativeAccountError } from "./errors";

export type { TimeBlockDto };
/** Only the supplied fields change; a move or resize sends start and end together; goalId null removes the goal. */
export interface TimeBlockPatch { start?: string; end?: string; goalId?: string | null; title?: string }
export interface NewTimeBlock { start: string; end: string; goalId?: string | null; title?: string }

export interface TimeBlockTransport {
  list(): Promise<TimeBlockDto[]>;
  /** null when the goal is missing or foreign. */
  create(block: NewTimeBlock): Promise<TimeBlockDto | null>;
  /** null when the block or goal is missing or foreign. */
  update(id: string, patch: TimeBlockPatch): Promise<TimeBlockDto | null>;
  remove(id: string): Promise<boolean>;
  /** Ticket 08: puts a task into the block or takes it out; null when either is missing or foreign. */
  setTask(id: string, taskId: string, linked: boolean): Promise<TimeBlockDto | null>;
}

export function browserTimeBlockTransport(fetcher: typeof fetch = fetch): TimeBlockTransport {
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
  const one = (id: string) => `/api/v1/time-blocks/${encodeURIComponent(id)}`;
  return {
    list: async () => {
      const body = await request<TimeBlocksDto>("GET", "/api/v1/time-blocks");
      if (!body) throw new AccountTransportError("TASKS_UNAVAILABLE");
      return body.blocks;
    },
    create: async (block) => (await request<{ block: TimeBlockDto }>("POST", "/api/v1/time-blocks", block))?.block ?? null,
    update: async (id, patch) => (await request<{ block: TimeBlockDto }>("PATCH", one(id), patch))?.block ?? null,
    remove: async (id) => Boolean(await request("DELETE", one(id))),
    setTask: async (id, taskId, linked) => (await request<{ block: TimeBlockDto }>(linked ? "PUT" : "DELETE", `${one(id)}/tasks/${encodeURIComponent(taskId)}`))?.block ?? null,
  };
}

export function timeBlockTransport(): TimeBlockTransport {
  if (!isTauri()) return browserTimeBlockTransport();
  const command = async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
    try { return await invoke<T>(name, args); }
    catch (error) { throw nativeAccountError(error); }
  };
  // One fixed native command per operation; Rust attaches the Keychain bearer.
  return {
    list: async () => (await command<TimeBlocksDto>("time_blocks")).blocks,
    create: async (block) => (await command<{ block: TimeBlockDto } | null>("create_time_block", { block }))?.block ?? null,
    update: async (id, patch) => (await command<{ block: TimeBlockDto } | null>("update_time_block", { id, patch }))?.block ?? null,
    remove: async (id) => Boolean(await command<unknown>("delete_time_block", { id })),
    setTask: async (id, taskId, linked) => (await command<{ block: TimeBlockDto } | null>("set_time_block_task", { id, taskId, linked }))?.block ?? null,
  };
}

/** Same convention as goalKeys: every key starts with ["user", userId]. */
export const timeBlockKeys = { all: (userId: string) => ["user", userId, "time-blocks"] as const };

export const timeBlockQueries = (transport: TimeBlockTransport) => ({
  list: (userId: string) => queryOptions({ queryKey: timeBlockKeys.all(userId), queryFn: () => transport.list() }),
});

/**
 * Writes show at once (a dragged block must not jump back while the server
 * answers) and roll back when refused.
 */
export function timeBlockMutations(transport: TimeBlockTransport, cache: QueryClient, userId: string) {
  const key = timeBlockKeys.all(userId);
  async function optimistic<T>(change: (blocks: TimeBlockDto[]) => TimeBlockDto[], write: () => Promise<T | null | false>) {
    await cache.cancelQueries({ queryKey: key });
    const before = cache.getQueryData<TimeBlockDto[]>(key);
    if (before) cache.setQueryData(key, change(before));
    try {
      const result = await write();
      if (!result) throw new AccountTransportError("SAVE_FAILED");
      return result;
    } catch (error) { if (before) cache.setQueryData(key, before); throw error; }
    finally { await cache.invalidateQueries({ queryKey: key }); }
  }
  return {
    create: (block: NewTimeBlock) => optimistic(blocks => [...blocks, { id: `pending-${block.start}`, goalId: block.goalId ?? null, title: block.title?.trim() || null, start: block.start, end: block.end, taskIds: [] }], () => transport.create(block)),
    update: (id: string, patch: TimeBlockPatch) => optimistic(blocks => blocks.map(block => block.id === id ? { ...block, ...patch, title: patch.title === undefined ? block.title : patch.title.trim() || null } : block), () => transport.update(id, patch)),
    remove: (id: string) => optimistic(blocks => blocks.filter(block => block.id !== id), () => transport.remove(id)),
    setTask: (id: string, taskId: string, linked: boolean) => optimistic(blocks => blocks.map(block => block.id !== id ? block
      : { ...block, taskIds: linked ? [...new Set([...block.taskIds, taskId])] : block.taskIds.filter(item => item !== taskId) }), () => transport.setTask(id, taskId, linked)),
  };
}
