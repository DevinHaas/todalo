import { MutationCache, onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";

/**
 * How often visible screens refetch their reads so another device's changes
 * show up (ticket 22). TanStack pauses the interval while the page is hidden
 * (focusManager follows visibilitychange, which the iOS webview fires on
 * background/foreground) and refetches stale reads on return and on reconnect.
 */
export const POLL_INTERVAL_MS = 60_000;

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
export function userQueryClient(connection: ConnectionMonitor, onError: (error: Error) => void) {
  const failed = (error: Error) => { connection.failed(error); onError(error); };
  const reached = () => connection.reached();
  return new QueryClient({
    queryCache: new QueryCache({ onError: failed, onSuccess: reached }),
    mutationCache: new MutationCache({ onError: failed, onSuccess: reached }),
    defaultOptions: {
      queries: { retry: false, refetchInterval: POLL_INTERVAL_MS, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}
