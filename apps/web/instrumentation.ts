// Sentry on the server: loads the runtime's config at startup and reports errors from
// Server Components, route handlers and the proxy. Off without NEXT_PUBLIC_SENTRY_DSN.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      // ponytail: traces every request while traffic is small; lower when the quota gets tight
      tracesSampleRate: 1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
