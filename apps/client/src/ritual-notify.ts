// Goals ticket 14b: "Your Evening review is ready" notifications. Mac through
// tauri-plugin-notification (the capability allows only the permission check,
// the permission request and showing one), the browser Notification API on web.
import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

const browser = () => typeof Notification === "undefined" ? null : Notification;

/** Asks once (the OS remembers the answer); a refusal only means no notifications. */
export async function askNotificationPermission() {
  try {
    if (isTauri()) { if (!await isPermissionGranted()) await requestPermission(); return; }
    if (browser()?.permission === "default") await browser()!.requestPermission();
  } catch { /* no notifications on this device */ }
}

/** Shows one notification; clicking it brings todalo forward and calls `onOpen`. */
export async function notifyReady(title: string, body: string, onOpen: () => void) {
  try {
    if (isTauri()) {
      if (!await isPermissionGranted()) return;
      sendNotification({ title, body });
      // ponytail: the desktop plugin reports no click; clicking activates the app,
      // so the next window focus within 10 minutes opens the ritual.
      const open = () => { window.removeEventListener("focus", open); clearTimeout(expire); onOpen(); };
      const expire = setTimeout(() => window.removeEventListener("focus", open), 10 * 60_000);
      window.addEventListener("focus", open);
      return;
    }
    if (browser()?.permission !== "granted") return;
    const shown = new Notification(title, { body });
    shown.onclick = () => { window.focus(); onOpen(); shown.close(); };
  } catch { /* no notifications on this device */ }
}

/** One notification per ritual per period, remembered on this device. */
export function firstTimeFor(userId: string, kind: string, period: string) {
  const key = `todalo:ritual-notified:${userId}:${kind}`;
  try {
    if (localStorage.getItem(key) === period) return false;
    localStorage.setItem(key, period);
  } catch { /* storage unavailable: may repeat after a reload */ }
  return true;
}
