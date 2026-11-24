import { MutationCache, onlineManager, QueryCache, QueryClient, type Mutation } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";

/**
 * How often visible screens refetch their reads (ticket 22). Since live sync (sync.ts,
 * calendar.ts startLiveUpdates) pushes changes and catches up on every connect and resume, this
 * is only the safety net for a stream that died silently: every few minutes, not every minute
 * (each poll refetches every active read, `/today` included). TanStack pauses it while the page
 * is hidden and refetches stale reads on return and on reconnect.
 */
export const POLL_INTERVAL_MS = 5 * 60_000;
/** How long a read counts as fresh when a screen mounts it again (userQueryClient). */
export const STALE_MS = 30_000;

export type Connection = "online" | "offline" | "unreachable";

/**
 * Connection state: the device's network (TanStack's onlineManager, i.e.
 * navigator online/offline events) plus whether the last request reached the
 * server. Any server response, even an error, counts as reaching it.
 */
export function connectionMonitor(online = onlineManager) {
  let unreachable = false;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => {
    if (value === unreachable) return;
    unreachable = value;
    for (const listener of listeners) listener();
  };
  return {
    failed(error: unknown) { if (error instanceof AccountTransportError) set(error.code === "CONNECTION_FAILED"); },
    reached() { set(false); },
    get: (): Connection => !online.isOnline() ? "offline" : unreachable ? "unreachable" : "online",
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const stop = online.subscribe(listener);
      return () => { listeners.delete(listener); stop(); };
    },
  };
}
export type ConnectionMonitor = ReturnType<typeof connectionMonitor>;

/**
 * The user-scoped cache. Reads poll while visible and refetch on foreground and
 * reconnect. Writes never wait for the network to return (networkMode
 * "always"): offline they fail at once and the form keeps its draft, so nothing
 * is queued and replayed later. Only the per-feature retries for writes that are
 * safe to repeat (operation IDs, versions) remain.
 */
/** `onWriteError`: a write failed after its retries (the failure toast, toasts.ts). */
export function userQueryClient(connection: ConnectionMonitor, onError: (error: Error) => void, onWriteError?: (error: Error, input: unknown, mutation: Mutation<unknown, unknown, unknown, unknown>) => void) {
  const failed = (error: Error) => { connection.failed(error); onError(error); };
  const reached = () => connection.reached();
  return new QueryClient({
    queryCache: new QueryCache({ onError: failed, onSuccess: reached }),
    mutationCache: new MutationCache({ onError: (error, input, _context, mutation) => { failed(error); onWriteError?.(error, input, mutation); }, onSuccess: reached }),
    defaultOptions: {
      // staleTime: a read under 30 s old is not refetched when another screen mounts it (tab
      // switches); live sync (sync.ts) patches or invalidates reads as changes happen anyway.
      queries: { retry: false, staleTime: STALE_MS, refetchInterval: POLL_INTERVAL_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}
