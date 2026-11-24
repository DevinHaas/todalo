import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const host = process.env.TAURI_DEV_HOST;
// Tauri runs this as beforeDev/BuildCommand in the CLI's own environment. Its
// Xcode-driven Rust build only receives TAURI*-prefixed variables, so an iOS
// build would silently drop TODALO_API_BASE_URL (see src-tauri/build.rs).
const requestedApi = process.env.TODALO_API_BASE_URL;
if (process.env.TAURI_ENV_PLATFORM === "ios" && requestedApi && requestedApi !== process.env.TAURI_TODALO_API_BASE_URL) {
  throw new Error("iOS builds cannot see TODALO_API_BASE_URL. Export TAURI_TODALO_API_BASE_URL with the same origin instead.");
}
// Perf harness (perf/README.md): ANALYZE=1 writes a bundle treemap; PERF_REACT_SCAN=1 builds an
// unminified copy with React Scan loaded before React so the harness can count renders.
// PERF_IPC_BENCH=1 (dev server only): times native IPC inside the Tauri app (perf/ipc-bench.ts).
const reactScan = process.env.PERF_REACT_SCAN === "1";
export default defineConfig({
  plugins: [react(), tailwindcss(),
    process.env.ANALYZE === "1" && visualizer({ filename: "perf/results/bundle.html", template: "treemap", gzipSize: true, brotliSize: true }),
    process.env.PERF_IPC_BENCH === "1" && {
      name: "perf-ipc-bench",
      transform: (code: string, id: string) => id.endsWith("/src/main.tsx") ? `import "../perf/ipc-bench";\n${code}` : undefined,
      configureServer: (server: { middlewares: { use(path: string, handler: (req: NodeJS.ReadableStream, res: { end(): void }) => void): void } }) => {
        server.middlewares.use("/__ipcbench", (req, res) => {
          let body = ""; req.on("data", (chunk: Buffer) => { body += chunk; }); req.on("end", () => { console.log(`IPCBENCH ${body}`); res.end(); });
        });
      },
    },
    // Web builds: a brotli-11 copy of each hashed text asset, served by apps/api (client-files.ts);
    // ~20% smaller than Cloudflare's on-the-fly compression. Tauri builds read local files: none.
    !process.env.TAURI_ENV_PLATFORM && {
      name: "precompress", apply: "build" as const,
      writeBundle: ({ dir = "dist" }: { dir?: string }, bundle: Record<string, unknown>) => {
        for (const name of Object.keys(bundle)) {
          if (!/^assets\/.+\.(js|css|svg|json)$/.test(name)) continue;
          const data = readFileSync(join(dir, name));
          if (data.length > 1024) writeFileSync(join(dir, `${name}.br`), brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        }
      },
    },
    reactScan && { name: "perf-react-scan", transform: (code: string, id: string) => id.endsWith("/src/main.tsx") ? `import "../perf/scan-entry";\n${code}` : undefined },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: {
    // ponytail: IPv4 by default; Node binds `localhost` to ::1 only and the Tauri webview dials 127.0.0.1.
    port: 5173, strictPort: true, host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Keep browser authentication same-origin. Production hosting must proxy
    // these same paths to Elysia; no credentials are bundled into this client.
    proxy: { "/api": { target: process.env.CLIENT_API_PROXY_TARGET ?? "http://127.0.0.1:3001", changeOrigin: false, ws: true } },
  },
  build: {
    target: "safari15.4", ...(reactScan && { minify: false }),
    // The vendored UI library (src/ui) is imported through its barrel; its modules only define
    // components, so ones the app doesn't use (combobox, accordion, menubar, …) can be dropped.
    rolldownOptions: { treeshake: { moduleSideEffects: [{ test: /\/src\/ui\/.*\.tsx?$/, sideEffects: false }] } },
  },
});
