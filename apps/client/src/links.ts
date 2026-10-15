import { invoke, isTauri } from "@tauri-apps/api/core";
import { nativeAccountError } from "./errors";

// Task links (ticket 18). The legacy URL is `<origin>/tasks/<encodeURIComponent(id)>`.
export const taskPath = (id: string) => `/tasks/${encodeURIComponent(id)}`;

/**
 * The shareable https link. The browser uses its own origin (legacy copyTaskUrl);
 * native asks Rust, which knows the API origin — the custom scheme is never shared.
 */
export async function taskUrl(id: string): Promise<string> {
  if (!isTauri()) return `${window.location.origin}${taskPath(id)}`;
  try { return await invoke<string>("task_link", { id }); }
  catch (error) { throw nativeAccountError(error); }
}

/** Legacy copyTaskUrl messages. Resolve the URL first: WebKit drops the user gesture across an await. */
export async function copyText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard) {
  if (!clipboard?.writeText) throw new Error("Clipboard access is unavailable. Open task details and copy the link manually.");
  try { await clipboard.writeText(text); }
  catch { throw new Error("The browser blocked copying. Retry using Copy link or copy the task link manually."); }
}

/** The only routes a native deep link may open (Rust validated them already). */
const LINK_ROUTE = /^\/tasks\/[A-Za-z0-9_-]{1,128}$/;

type Navigation = Pick<Window, "location" | "history" | "dispatchEvent">;

/** Pushes the route and lets React Router (or, when signed out, the next sign-in) pick it up. */
export function openRoute(route: string, target: Navigation = window) {
  if (!LINK_ROUTE.test(route) || target.location.pathname === route) return;
  target.history.pushState(null, "", route);
  target.dispatchEvent(new Event("popstate"));
}

/**
 * Waits for task links Rust received (cold launch or while running) and opens
 * each. Navigation only: a link never writes. Stops if the command fails.
 */
export async function followNativeLinks(next: () => Promise<string> = () => invoke<string>("next_link"), open = openRoute) {
  for (;;) {
    let route: string;
    try { route = await next(); } catch { return; }
    open(route);
  }
}
