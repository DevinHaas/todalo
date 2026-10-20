import { afterEach, expect, it, vi } from "vitest";
import { focusManager, MutationObserver, onlineManager, QueryObserver } from "@tanstack/react-query";
import { connectionMonitor, POLL_INTERVAL_MS, userQueryClient } from "./connection";
import { AccountTransportError } from "./errors";

// TanStack only runs refetch intervals outside a server; make this node test look like a browser.
vi.hoisted(() => { (globalThis as { window?: unknown }).window ??= globalThis; });

afterEach(() => { onlineManager.setOnline(true); focusManager.setFocused(undefined); vi.useRealTimers(); });

it("reports offline, unreachable and recovered connection states", () => {
  const connection = connectionMonitor();
  const seen: string[] = [];
  const stop = connection.subscribe(() => seen.push(connection.get()));
  expect(connection.get()).toBe("online");
  connection.failed(new AccountTransportError("CONNECTION_FAILED"));
  expect(connection.get()).toBe("unreachable");
  // A server error is still a response: the server is reachable.
  connection.failed(new AccountTransportError("SAVE_FAILED"));
  expect(connection.get()).toBe("online");
  connection.failed(new AccountTransportError("CONNECTION_FAILED"));
  onlineManager.setOnline(false);
  expect(connection.get()).toBe("offline");
  onlineManager.setOnline(true);
  connection.reached();
  expect(seen).toEqual(["unreachable", "online", "unreachable", "offline", "unreachable", "online"]);
  stop();
});

it("fails an offline write at once and never replays it on reconnect", async () => {
  const cache = userQueryClient(connectionMonitor(), () => {});
  onlineManager.setOnline(false);
  const write = vi.fn(async () => { throw new AccountTransportError("CONNECTION_FAILED"); });
  await expect(new MutationObserver(cache, { mutationFn: write }).mutate()).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  onlineManager.setOnline(true);
  await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1);
  expect(cache.getMutationCache().getAll().some(mutation => mutation.state.isPaused)).toBe(false);
});

it("polls visible reads, pauses while hidden and refetches on return", async () => {
  vi.useFakeTimers();
  const connection = connectionMonitor();
  const cache = userQueryClient(connection, () => {});
  cache.mount(); // as QueryClientProvider does: listens to focus and online changes
  const read = vi.fn(async () => "tasks");
  const stop = new QueryObserver(cache, { queryKey: ["user", "alice", "today"], queryFn: read }).subscribe(() => {});
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(read).toHaveBeenCalledTimes(2);
  focusManager.setFocused(false);
  await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(read).toHaveBeenCalledTimes(2);
  focusManager.setFocused(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(3);
  stop();
  cache.unmount();
});

it("marks the server unreachable from a failed read and clears it on the next success", async () => {
  const connection = connectionMonitor();
  const cache = userQueryClient(connection, () => {});
  await cache.fetchQuery({ queryKey: ["a"], queryFn: async () => { throw new AccountTransportError("CONNECTION_FAILED"); } }).catch(() => {});
  expect(connection.get()).toBe("unreachable");
  await cache.fetchQuery({ queryKey: ["b"], queryFn: async () => "ok" });
  expect(connection.get()).toBe("online");
});
