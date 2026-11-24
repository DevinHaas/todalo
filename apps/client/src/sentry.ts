// What monitoring.ts uses from Sentry, as named imports: loaded with import("./sentry"), the
// chunk keeps only these (a dynamic import of the whole package can't be tree-shaken).
export { browserTracingIntegration, captureException, consoleLoggingIntegration, init, setUser } from "@sentry/react";
