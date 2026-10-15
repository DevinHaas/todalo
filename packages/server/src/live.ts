// Per-user change notifications behind the live stream (legacy calendar-sync-notify).
// Server-only. Publishers (the calendar webhook today; task writes in ticket 22)
// and the stream's subscribers must run in the same process.
import type { LiveTopic } from "./calendar-input";

type Listener = (topic: LiveTopic) => void;

// ponytail: in-memory, single-instance ceiling — swap for Redis/Postgres pub/sub
// before running more than one API process. Stashed on globalThis so it survives
// dev-mode module reloads (Next HMR, bun --watch).
const globalForLive = globalThis as unknown as { todaloLiveSubscribers?: Map<string, Set<Listener>> };
const subscribers = globalForLive.todaloLiveSubscribers ?? new Map<string, Set<Listener>>();
globalForLive.todaloLiveSubscribers = subscribers;

export function subscribe(userId: string, listener: Listener) {
  let set = subscribers.get(userId);
  if (!set) subscribers.set(userId, set = new Set());
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) subscribers.delete(userId);
  };
}

export function publish(userId: string, topic: LiveTopic) {
  for (const listener of subscribers.get(userId) ?? []) {
    // One closed or failing stream never stops delivery to the user's other devices.
    try { listener(topic); } catch { /* the stream's own cancel unsubscribes it */ }
  }
}
