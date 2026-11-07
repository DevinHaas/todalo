import type { Mutation, QueryClient } from "@tanstack/react-query";
import { AccountTransportError } from "./errors";
import { createToastManager } from "./ui";

/**
 * `meta.action` names what a write does, in the toast's words: given the
 * mutation's input it returns e.g. `move "Buy milk" to Tuesday`. Writes with an
 * action get a failure toast; writes without one (sign-in, import) show their
 * errors on their own screens.
 */
export interface WriteMeta extends Record<string, unknown> { action?: (input: any) => string }
declare module "@tanstack/react-query" {
  interface Register { mutationMeta: WriteMeta }
}

/** The app's one toast queue, rendered by the root Toaster (main.tsx). */
export const toasts = createToastManager();

export interface WriteFailure { title: string; description: string; retry: boolean }

const undone = "Your change was undone.";
/**
 * The failure toast for a write: what failed, why, in plain words, and
 * whether Retry makes sense (only when the same write could still succeed:
 * no connection or a server fault). null: say nothing (the user cancelled a
 * criteria confirm; a lost session signs out on its own).
 */
export function writeFailure(error: unknown, action: string, online = true): WriteFailure | null {
  const code = error instanceof AccountTransportError ? error.code : undefined;
  if (code === "CRITERIA_OPEN" || code === "UNAUTHENTICATED") return null;
  const title = `Couldn't ${action}`;
  const fail = (description: string, retry = false) => ({ title, description, retry });
  switch (code) {
    case "CONNECTION_FAILED": return fail(online ? `todalo can't be reached right now. ${undone}` : `You're offline. ${undone}`, true);
    case "TASK_CHANGED": return fail(`It was changed on another device, so the latest version is shown. ${undone}`);
    case "TASK_NOT_FOUND": case "PROJECT_NOT_FOUND": case "GOAL_NOT_FOUND": case "CALENDAR_NOT_FOUND": return fail(`It no longer exists; it may have been deleted on another device. ${undone}`);
    case "INVALID_INPUT": return fail(`todalo didn't accept that value. Check it and try again. ${undone}`);
    case undefined: case "SAVE_FAILED": case "INVALID_RESPONSE": case "UNKNOWN_NATIVE_ERROR": return fail(`Something went wrong on todalo's side. ${undone}`, true);
    default: return fail(`${(error as Error).message} ${undone}`);
  }
}

const reported = new WeakSet<object>();
/** Whether a write's failure already has its toast, so inline banners leave it out (field validation stays inline). */
export const toasted = (error: unknown) => typeof error === "object" && error !== null && reported.has(error);
/** An inline banner's text: null when the failure is already toasted. */
export const inlineError = (error: unknown, fallback = "Your changes could not be saved. Try again.") =>
  toasted(error) ? null : error instanceof Error ? error.message : fallback;

let next = 0;
/**
 * The query cache's write-error handler: one toast per failed write (after its
 * own retries). Retry runs the same mutation again with the same input, so an
 * operation ID or version it carries keeps the retry safe. A conflict needs no
 * extra step: the write's settle refetches the task.
 */
export function reportWriteError(cache: QueryClient, error: Error, input: unknown, mutation: Mutation<unknown, unknown, unknown, unknown>) {
  const action = mutation.meta?.action?.(input);
  const failure = action && writeFailure(error, action, typeof navigator === "undefined" || navigator.onLine);
  if (!failure) return;
  reported.add(error);
  const id = `write-${++next}`;
  toasts.add({
    id, type: "error", priority: "high", title: failure.title, description: failure.description,
    ...(failure.retry && { actionProps: { children: "Retry", onClick: () => {
      toasts.close(id);
      void cache.getMutationCache().build(cache, mutation.options).execute(input).catch(() => {});
    } } }),
  });
}
