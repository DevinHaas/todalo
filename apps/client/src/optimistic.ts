import type { QueryClient, QueryFilters, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic writes, one shared pattern for every mutation.
 *
 * A write patches every cached read it affects at once (`begin`), then either
 * keeps its patch with the server's result applied on top (`commit`), or
 * takes back exactly its own patch (`rollback`). Each affected read is tracked
 * as a base value plus the patches ("layers") of the writes still open on it,
 * so undoing one write re-applies the others' patches instead of restoring a
 * snapshot that would wipe them. Reads are refetched only once no write is in
 * flight (`settle`), so a refetch can't drop another write's pending patch.
 */
export interface Change {
  filters: QueryFilters;
  /** Gets the cached value (possibly null); returns the patched value. Must not mutate it. */
  patch: (data: any, key: QueryKey) => unknown;
}
/** A change to one exact query key. */
export const change = <T,>(queryKey: QueryKey, patch: (data: T) => T): Change => ({ filters: { queryKey, exact: true }, patch });

interface Layer { patches: Map<string, (data: unknown) => unknown>; done: boolean }
interface Entry { key: QueryKey; base: unknown; layers: Layer[]; last: unknown }
interface Book { entries: Map<string, Entry>; inflight: number; stale: QueryFilters[]; idle: (() => void)[] }
/** An open write, returned by `begin` (TanStack: the onMutate context). */
export interface Write { cache: QueryClient; layer: Layer; settled?: boolean }

const books = new WeakMap<QueryClient, Book>();
const book = (cache: QueryClient) => {
  let found = books.get(cache);
  if (!found) books.set(cache, found = { entries: new Map(), inflight: 0, stale: [], idle: [] });
  return found;
};
const dataOf = (cache: QueryClient, hash: string) => cache.getQueryCache().get(hash)?.state.data;

function rebuild(cache: QueryClient, hash: string, entry: Entry) {
  const value = entry.layers.reduce((data, layer) => { const patch = layer.patches.get(hash); return patch ? patch(data) : data; }, entry.base);
  cache.setQueryData(entry.key, value);
  entry.last = dataOf(cache, hash);
  forget(cache, hash, entry);
}
// Once every write on a read has finished, its current value is simply the new base.
const forget = (cache: QueryClient, hash: string, entry: Entry) => { if (entry.layers.every(layer => layer.done)) book(cache).entries.delete(hash); };

function track(cache: QueryClient, layer: Layer, changes: Change[]) {
  const { entries } = book(cache);
  const touched = new Set<string>();
  for (const { filters, patch } of changes) for (const query of cache.getQueryCache().findAll(filters)) {
    const data = query.state.data;
    if (data === undefined) continue; // never loaded: nothing to show yet
    const hash = query.queryHash, key = query.queryKey;
    let entry = entries.get(hash);
    // Something outside this book (a refetch) replaced the read: it is the new base.
    if (!entry || entry.last !== data) entries.set(hash, entry = { key, base: data, layers: [], last: data });
    // ponytail: a read whose shape a patch doesn't expect is left as it is; the settle refetch fixes it.
    const safe = (value: unknown) => { try { return patch(value, key); } catch { return value; } };
    const earlier = layer.patches.get(hash);
    layer.patches.set(hash, earlier ? (value) => safe(earlier(value)) : safe);
    if (!entry.layers.includes(layer)) entry.layers.push(layer);
    touched.add(hash);
  }
  for (const hash of touched) rebuild(cache, hash, entries.get(hash)!);
}

/** Starts a write: cancels in-flight reads of what it changes, then patches them. */
export async function begin(cache: QueryClient, changes: Change[] = []): Promise<Write> {
  book(cache).inflight++;
  const layer: Layer = { patches: new Map(), done: false };
  await Promise.all(changes.map(({ filters }) => cache.cancelQueries(filters)));
  track(cache, layer, changes);
  return { cache, layer };
}

/** The write failed: take back exactly its patch, keeping every other open write's. */
export function rollback({ cache, layer }: Write) {
  layer.done = true;
  const { entries } = book(cache);
  for (const hash of layer.patches.keys()) {
    const entry = entries.get(hash);
    const index = entry ? entry.layers.indexOf(layer) : -1;
    if (!entry || index < 0 || dataOf(cache, hash) !== entry.last) {
      // ponytail: a refetch replaced this read mid-write, so the patch can't be peeled off; reload it instead.
      const key = cache.getQueryCache().get(hash)?.queryKey;
      if (key) void cache.invalidateQueries({ queryKey: key, exact: true });
      continue;
    }
    entry.layers.splice(index, 1);
    rebuild(cache, hash, entry);
  }
}

/** The write succeeded: keep its patch, then apply the server's result (`changes`) on top of it. */
export function commit({ cache, layer }: Write, changes: Change[] = []) {
  layer.done = true;
  track(cache, layer, changes);
  const { entries } = book(cache);
  for (const hash of layer.patches.keys()) { const entry = entries.get(hash); if (entry) forget(cache, hash, entry); }
}

/** Ends a write; `refresh` is refetched once no write is in flight (batched with the others'). */
export function settle(write: Write, refresh: QueryFilters[] = []): Promise<unknown> {
  const state = book(write.cache);
  if (!write.settled) { write.settled = true; state.inflight--; }
  state.stale.push(...refresh);
  if (state.inflight > 0) return Promise.resolve();
  for (const resolve of state.idle.splice(0)) resolve();
  const stale = state.stale.splice(0);
  const unique = [...new Map(stale.map(filters => [JSON.stringify(filters.queryKey ?? null) + String(filters.exact ?? false), filters])).values()];
  return Promise.all(unique.map(filters => write.cache.invalidateQueries(filters)));
}

/**
 * Waits until no write is in flight, as refetches do: server changes from
 * elsewhere (sync.ts) land only then, so they never replace a pending write's patch.
 * Resolves at once when idle; a caller applying changes should do so synchronously.
 */
export async function idle(cache: QueryClient): Promise<void> {
  const state = book(cache);
  while (state.inflight > 0) await new Promise<void>(resolve => state.idle.push(resolve));
}

/** The pattern as TanStack mutation callbacks: spread into the mutation's options. */
export function optimistic<V, R = unknown>(cache: QueryClient, plan: {
  apply?: (input: V) => Change[];
  reconcile?: (result: R, input: V) => Change[];
  refresh?: (input: V) => QueryFilters[];
}) {
  return {
    onMutate: (input: V) => begin(cache, plan.apply?.(input)),
    onError: (_error: Error, _input: V, write?: Write) => { if (write) rollback(write); },
    onSuccess: (result: R, input: V, write?: Write) => { if (write) commit(write, plan.reconcile?.(result, input)); },
    onSettled: (_result: unknown, _error: Error | null, input: V, write?: Write) => write ? settle(write, plan.refresh?.(input)) : undefined,
  };
}

/** The pattern for a plain async write (goals, seasons, projects, labels). */
export async function optimisticWrite<R>(cache: QueryClient, changes: Change[], run: () => Promise<R>, refresh: QueryFilters[] = [], reconcile?: (result: R) => Change[]): Promise<R> {
  const write = await begin(cache, changes);
  try { const result = await run(); commit(write, reconcile?.(result)); return result; }
  catch (error) { rollback(write); throw error; }
  finally { await settle(write, refresh); }
}
