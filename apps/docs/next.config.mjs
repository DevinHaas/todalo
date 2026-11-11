import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";

// .mjs, not .ts: fumadocs-mdx is ESM-only.
/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  // Monorepo root, so the standalone trace includes hoisted node_modules.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://eu-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
  },
};

export default createMDX()(config);
