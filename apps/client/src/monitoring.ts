// Sentry (errors, traces, console warnings/errors as logs) and PostHog (product analytics).
// Imported first in main.tsx so errors during startup are caught. Each stays off until its
// key is set at build time: VITE_SENTRY_DSN, VITE_POSTHOG_KEY.
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import { isTauri } from "@tauri-apps/api/core";
import { appVersion } from "./releases";

const app = isTauri() ? "native" : "web";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  release: `todalo-client@${appVersion}`,
  environment: import.meta.env.MODE,
  // ponytail: every session traced while users are few; lower it when the quota gets tight
  tracesSampleRate: 1,
  integrations: [Sentry.browserTracingIntegration(), Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  initialScope: { tags: { app } },
});

const key = import.meta.env.VITE_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: "https://eu.i.posthog.com",
    defaults: "2026-08-30",
    // the Tauri CSP allows no remote scripts: no toolbar, surveys or recordings
    disable_external_dependency_loading: true,
    disable_session_recording: true,
  });
  posthog.register({ app, appVersion });
}

let current: string | null = null;
/** Ties analytics and errors to the signed-in account (by id; the email only goes to PostHog). */
export function identify(user: { id: string; email: string; name: string } | null) {
  if ((user?.id ?? null) === current) return;
  current = user?.id ?? null;
  Sentry.setUser(user ? { id: user.id } : null);
  if (!key) return;
  if (user) posthog.identify(user.id, { email: user.email, name: user.name });
  else posthog.reset();
}
