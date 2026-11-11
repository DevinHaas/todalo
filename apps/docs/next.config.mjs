import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";

// .mjs, not .ts: fumadocs-mdx is ESM-only.
/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  // Monorepo root, so the standalone trace includes hoisted node_modules.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
};

export default createMDX()(config);
