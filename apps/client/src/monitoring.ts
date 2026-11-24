// Sentry (errors, traces, console warnings/errors as logs) and PostHog (product analytics).
// Imported first in main.tsx so errors during startup are caught. Each stays off until its
// key is set at build time: VITE_SENTRY_DSN, VITE_POSTHOG_KEY.
import { isTauri } from "@tauri-apps/api/core";
import { appVersion } from "./releases";

const app = isTauri() ? "native" : "web";

// Sentry (~120 KB gzipped) is its own chunk, loaded a moment after startup instead of parsed
// before the first frame (as Sentry's loader script does). Uncaught errors and rejections from
// before then are kept and sent once it is up. ponytail: console warnings logged before then
// are not forwarded.
const dsn = import.meta.env.VITE_SENTRY_DSN;
const early: unknown[] = [];
const keepError = (event: ErrorEvent) => { early.push(event.error ?? event.message); };
const keepRejection = (event: PromiseRejectionEvent) => { early.push(event.reason); };
if (dsn) { addEventListener("error", keepError); addEventListener("unhandledrejection", keepRejection); }
const monitoring = dsn ? new Promise(resolve => setTimeout(resolve, 1000)).then(() => import("./sentry")).then(Sentry => {
  Sentry.init({
    dsn,
    release: `todalo-client@${appVersion}`,
    environment: import.meta.env.MODE,
    // ponytail: every session traced while users are few; lower it when the quota gets tight
    tracesSampleRate: 1,
    integrations: [Sentry.browserTracingIntegration(), Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
    initialScope: { tags: { app } },
  });
  removeEventListener("error", keepError); removeEventListener("unhandledrejection", keepRejection);
  for (const error of early.splice(0)) Sentry.captureException(error);
  return Sentry;
}) : null;

const key = import.meta.env.VITE_POSTHOG_KEY;
// PostHog is its own chunk, loaded once the app has started; identify() calls wait for it in order.
const analytics = key ? new Promise(resolve => setTimeout(resolve, 1500)).then(() => import("posthog-js")).then(({ default: posthog }) => {
  posthog.init(key, {
    api_host: "https://eu.i.posthog.com",
    defaults: "2026-08-30",
    // the Tauri CSP allows no remote scripts: no toolbar, surveys or recordings
    disable_external_dependency_loading: true,
    disable_session_recording: true,
  });
  posthog.register({ app, appVersion });
  return posthog;
}) : null;

let current: string | null = null;
/** Ties analytics and errors to the signed-in account (by id; the email only goes to PostHog). */
export function identify(user: { id: string; email: string; name: string } | null) {
  if ((user?.id ?? null) === current) return;
  current = user?.id ?? null;
  void monitoring?.then(Sentry => Sentry.setUser(user ? { id: user.id } : null));
  void analytics?.then(posthog => { if (user) posthog.identify(user.id, { email: user.email, name: user.name }); else posthog.reset(); });
}

/** A product event; `people` also sets those properties on the person (e.g. onboarding answers). */
export function track(event: string, properties: Record<string, unknown> = {}, people?: Record<string, unknown>) {
  void analytics?.then(posthog => posthog.capture(event, { ...properties, ...(people && { $set: people }) }));
}
