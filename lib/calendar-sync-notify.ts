type Controller = ReadableStreamDefaultController<Uint8Array>;

// ponytail: in-memory, single-instance ceiling — swap for Redis pub/sub if
// this app ever runs multiple server instances. Stashed on globalThis so it
// survives dev-mode HMR module reloads.
const globalForNotify = globalThis as unknown as {
  calendarSyncSubscribers?: Map<string, Set<Controller>>;
};
const subscribers = globalForNotify.calendarSyncSubscribers ?? new Map<string, Set<Controller>>();
globalForNotify.calendarSyncSubscribers = subscribers;

export function subscribe(userId: string, controller: Controller) {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(controller);

  return () => {
    set.delete(controller);
    if (set.size === 0) subscribers.delete(userId);
  };
}

export function notify(userId: string) {
  const set = subscribers.get(userId);
  if (!set) return;

  const encoder = new TextEncoder();
  const payload = encoder.encode(`data: sync\n\n`);
  for (const controller of set) {
    try {
      controller.enqueue(payload);
    } catch {
      set.delete(controller);
    }
  }
}
