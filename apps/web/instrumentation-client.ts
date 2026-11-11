// Runs in the browser before the app hydrates. Each tool stays off until its key is set.
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// Sentry: errors, page-load and navigation traces, console warnings/errors as logs.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
});

// PostHog: page views and clicks, sent through /ingest (next.config.ts) so ad blockers
// don't drop them. Cookieless: no cookies or storage, so the landing page needs no consent
// banner; visitors are counted by a daily server-side hash instead.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    cookieless_mode: "always",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
