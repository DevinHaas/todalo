import { invoke, isTauri } from "@tauri-apps/api/core";
import type { QueryClient, QueryFilters, QueryKey } from "@tanstack/react-query";
import type { SyncDelta } from "../../../packages/server/src/sync-delta";
import { AccountTransportError, nativeAccountError } from "./errors";
import { idle, type Change } from "./optimistic";
import { taskChanges, taskKeys, type TaskDto } from "./tasks";
import type { CommentDto } from "../../../packages/server/src/comment-dto";

export type { SyncDelta };

/**
 * Live sync, client side (contract in packages/server/src/sync-delta.ts). The
 * live stream says "sync"; the client pulls what changed since its cursor and
 * merges it into the cached reads once no optimistic write is in flight
 * (optimistic.ts `idle`), so a pending write's patch is never replaced.
 * `full` answers (and ⌘R) refetch every read instead.
 */
export interface SyncTransport { changes(since: string | null): Promise<SyncDelta> }

export function browserSyncTransport(fetcher: typeof fetch = fetch): SyncTransport {
  return {
    async changes(since) {
      let response: Response;
      try { response = await fetcher(`/api/v1/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`, { credentials: "same-origin", cache: "no-store" }); }
      catch { throw new AccountTransportError("CONNECTION_FAILED"); }
      if (response.status === 401) throw new AccountTransportError("UNAUTHENTICATED");
      if (!response.ok) throw new AccountTransportError("TASKS_UNAVAILABLE");
      try { return await response.json() as SyncDelta; } catch { throw new AccountTransportError("INVALID_RESPONSE"); }
    },
  };
}

export const syncTransport = (): SyncTransport => !isTauri() ? browserSyncTransport() : {
  // Rust attaches the Keychain bearer; the cursor is validated there too.
  changes: async (since) => { try { return await invoke<SyncDelta>("sync_changes", { since }); } catch (error) { throw nativeAccountError(error); } },
};

/** Keeps a newer cached copy (this device's own write answered after the delta was read). */
const newer = (cached: { updatedAt: string | null }, incoming: { updatedAt: string | null }) =>
  Boolean(cached.updatedAt && incoming.updatedAt && cached.updatedAt > incoming.updatedAt);

/** Replaces rows by ID, drops deleted ones and appends new ones (optionally re-sorted as the server orders them). */
export function mergeById<T extends { id: string }>(rows: T[], upserts: T[], deleted: string[], options: { keep?: (cached: T, incoming: T) => boolean; add?: boolean; order?: (a: T, b: T) => number } = {}): T[] {
  const gone = new Set(deleted), incoming = new Map(upserts.map(row => [row.id, row]));
  const merged = rows.filter(row => !gone.has(row.id)).map(row => {
    const next = incoming.get(row.id);
    return next && !options.keep?.(row, next) ? next : row;
  });
  const have = new Set(rows.map(row => row.id));
  if (options.add !== false) merged.push(...upserts.filter(row => !have.has(row.id) && !gone.has(row.id)));
  return options.order ? merged.sort(options.order) : merged;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const oldestFirst = (a: CommentDto, b: CommentDto) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/**
 * What a delta does to the cache: `changes` patch reads row by row (tasks,
 * projects, labels, filters, comments); `refresh` lists the derived reads to
 * refetch (manual order, progress and joins only the server computes).
 */
export function deltaChanges(userId: string, delta: SyncDelta): { changes: Change[]; refresh: QueryFilters[] } {
  const user = taskKeys.user(userId);
  const changes: Change[] = [];
  const refresh: QueryFilters[] = [];
  const each = (filters: QueryFilters, patch: (data: any, key: QueryKey) => unknown) => changes.push({ filters, patch });

  if (delta.tasks.length || delta.deleted.task.length) {
    changes.push(...taskChanges(userId, tasks => mergeById<TaskDto>(tasks, delta.tasks, delta.deleted.task, { keep: newer })));
    for (const id of delta.deleted.task) each({ queryKey: taskKeys.task(userId, id), exact: true }, () => null);
    // Filter results and search are the server's to decide.
    refresh.push({ queryKey: [...user, "metadata", "filter"] }, { queryKey: [...user, "search"] });
    // The Weekly review's week is summed from tasks on the server (ticket 13).
    refresh.push({ queryKey: [...user, "rituals", "weekly"] });
  }
  const projects = [...delta.projects.map(project => project.id), ...delta.deleted.project];
  if (projects.length) {
    each({ queryKey: [...user, "projects"], exact: true }, (list: SyncDelta["projects"] | undefined) => list && mergeById(list, delta.projects, delta.deleted.project, { order: byName }));
    for (const id of projects) refresh.push({ queryKey: [...user, "project", id] });
    refresh.push({ queryKey: [...user, "destinations"] });
  }
  if (delta.labels.length || delta.filters.length || delta.deleted.label.length || delta.deleted.filter.length) {
    each({ queryKey: [...user, "metadata", "list"], exact: true }, (data: { labels: SyncDelta["labels"]; filters: SyncDelta["filters"] } | undefined) => data && {
      labels: mergeById(data.labels, delta.labels, delta.deleted.label, { order: byName }),
      filters: mergeById(data.filters, delta.filters, delta.deleted.filter, { order: byName }),
    });
    for (const id of [...delta.labels.map(label => label.id), ...delta.deleted.label]) refresh.push({ queryKey: [...user, "metadata", "label", id] });
    for (const id of [...delta.filters.map(filter => filter.id), ...delta.deleted.filter]) refresh.push({ queryKey: [...user, "metadata", "filter", id] });
  }
  if (delta.comments.length || delta.deleted.comment.length) {
    // Each task's comment list takes its own task's comments; a deleted ID is dropped wherever it is.
    each({ queryKey: [...user, "task"], predicate: query => query.queryKey[4] === "comments" }, (list: CommentDto[] | null | undefined, key) =>
      list && mergeById(list, delta.comments.filter(comment => key[3] === comment.taskId), delta.deleted.comment, { order: oldestFirst }));
  }
  if (delta.changed.includes("section")) refresh.push({ queryKey: [...user, "project"] }, { queryKey: [...user, "destinations"] });
  // Season rows show goal titles and colours; links feed goal pages, milestones and suggestions.
  if (delta.changed.includes("goal") || delta.changed.includes("goalLink")) refresh.push({ queryKey: [...user, "goals"] }, { queryKey: [...user, "seasons"] }, { queryKey: [...user, "rituals", "weekly"] });
  // The rituals' state names the current season's review (ticket 14).
  if (delta.changed.includes("season")) refresh.push({ queryKey: [...user, "seasons"] }, { queryKey: [...user, "rituals"] });
  // Ritual settings, runs and ratings (goals ticket 11).
  if (delta.changed.includes("ritual")) refresh.push({ queryKey: [...user, "rituals"] });
  return { changes, refresh };
}

/** Patches every loaded read a change matches (never-loaded reads stay unloaded). */
function apply(cache: QueryClient, changes: Change[]) {
  for (const { filters, patch } of changes) for (const query of cache.getQueryCache().findAll(filters)) {
    if (query.state.data === undefined) continue;
    // ponytail: a read whose shape a patch doesn't expect is left as it is; the next refetch fixes it.
    try { cache.setQueryData(query.queryKey, patch(query.state.data, query.queryKey)); } catch { /* left as it is */ }
  }
}

export type SyncState = "synced" | "syncing";

/**
 * One user's sync: `pull` fetches and merges the delta (calls during a pull
 * coalesce into one more), `reload` (⌘R) refetches everything and restarts
 * from a fresh cursor. `state` drives the toolbar's Synced / Syncing… label.
 */
export function createSync({ transport, cache, userId }: { transport: SyncTransport; cache: QueryClient; userId: string }) {
  let cursor: string | null = null;
  let pulling: Promise<void> | null = null;
  let again = false;
  let busy = 0;
  let lastSyncedAt: number | null = null;
  const listeners = new Set<() => void>();
  const working = async <T,>(run: () => Promise<T>) => {
    busy++; for (const listener of listeners) listener();
    try { const result = await run(); lastSyncedAt = Date.now(); return result; } finally { busy--; for (const listener of listeners) listener(); }
  };
  const everything = async () => { await idle(cache); await cache.invalidateQueries({ queryKey: taskKeys.user(userId) }); };

  async function once() {
    const delta = await transport.changes(cursor);
    const first = cursor === null;
    if (delta.full) {
      cursor = delta.cursor;
      // The first answer only starts the cursor: the screen's reads are loading anyway.
      if (!first) await everything();
      return;
    }
    const { changes, refresh } = deltaChanges(userId, delta);
    await idle(cache);
    apply(cache, changes); // synchronously after idle: no write can start in between
    cursor = delta.cursor;
    await Promise.all(refresh.map(filters => cache.invalidateQueries(filters)));
  }

  function pull(): Promise<void> {
    if (pulling) { again = true; return pulling; }
    pulling = working(async () => {
      try { do { again = false; await once(); } while (again); }
      finally { pulling = null; }
    });
    return pulling;
  }

  return {
    pull,
    reload: () => working(async () => {
      cursor = (await transport.changes(null)).cursor;
      await everything();
    }),
    get state(): SyncState { return busy > 0 ? "syncing" : "synced"; },
    /** When the last pull or reload finished successfully (epoch ms), null before the first. */
    get lastSyncedAt() { return lastSyncedAt; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
export type Sync = ReturnType<typeof createSync>;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
/** "8 seconds ago", "5 minutes ago" for the account menu's Sync row. */
export function syncedAgo(at: number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return relative.format(-seconds, "second");
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), "hour");
  return relative.format(-Math.floor(seconds / 86400), "day");
}
