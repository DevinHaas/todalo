// Sentry: errors, traces and logs for the API. Imported first in index.ts so its
// instrumentation (HTTP, Postgres) is in place before anything else loads.
// Without SENTRY_DSN (local development, tests) the SDK stays off.
import * as Sentry from "@sentry/elysia";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  // ponytail: every request is traced while traffic is small; lower it (e.g. 0.2) when the quota gets tight.
  tracesSampler: ({ name }) => (name.includes("/health") ? 0 : 1),
  // console.log/warn/error become Sentry logs (on by default in SDK v11), linked to the request's trace
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })],
});
