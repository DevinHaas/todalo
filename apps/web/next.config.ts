import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@todalo/db", "@todalo/auth", "@todalo/ramble", "@todalo/badge"],
  // PostHog through our own domain (see instrumentation-client.ts); EU region
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://eu-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
  },
  // PostHog paths end in a slash; without this Next answers them with a redirect first
  skipTrailingSlashRedirect: true,
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set (the production build).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // browser events go through /monitoring on our domain, past ad blockers
  tunnelRoute: "/monitoring",
});
