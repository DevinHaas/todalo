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

const BLOCKED = "The browser blocked copying. Retry using Copy link or copy the task link manually.";

/** Legacy copyTaskUrl messages. Resolve the URL first: WebKit drops the user gesture across an await. */
export async function copyText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard) {
  if (!clipboard?.writeText) throw new Error("Clipboard access is unavailable. Open task details and copy the link manually.");
  try { await clipboard.writeText(text); }
  catch { throw new Error(BLOCKED); }
}

/**
 * Copy task URL key (legacy copyTaskUrl). The browser knows the link at once;
 * native hands WebKit a ClipboardItem with the pending link, so the write
 * still starts inside the key press.
 */
export function copyTaskLink(id: string, clipboard: Pick<Clipboard, "writeText" | "write"> | undefined = navigator.clipboard, native = isTauri()): Promise<void> {
  if (!native) return copyText(`${window.location.origin}${taskPath(id)}`, clipboard);
  if (!clipboard?.write || typeof ClipboardItem === "undefined") return taskUrl(id).then(url => copyText(url, clipboard));
  const text = taskUrl(id).then(url => new Blob([url], { type: "text/plain" }));
  return clipboard.write([new ClipboardItem({ "text/plain": text })]).catch(() => { throw new Error(BLOCKED); });
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

/** "Copy link to project": the web address of the project page. */
export async function copyProjectLink(id: string, clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard) {
  const path = `/projects/${encodeURIComponent(id)}`;
  // ponytail: native reuses task_link's origin (same ID rules); app deep links open tasks only, so this opens the web app.
  const url = isTauri() ? (await taskUrl(id)).replace(/\/tasks\/[^/]+$/, path) : `${window.location.origin}${path}`;
  return copyText(url, clipboard);
}
