import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
// Tauri runs this as beforeDev/BuildCommand in the CLI's own environment. Its
// Xcode-driven Rust build only receives TAURI*-prefixed variables, so an iOS
// build would silently drop TODALO_API_BASE_URL (see src-tauri/build.rs).
const requestedApi = process.env.TODALO_API_BASE_URL;
if (process.env.TAURI_ENV_PLATFORM === "ios" && requestedApi && requestedApi !== process.env.TAURI_TODALO_API_BASE_URL) {
  throw new Error("iOS builds cannot see TODALO_API_BASE_URL. Export TAURI_TODALO_API_BASE_URL with the same origin instead.");
}
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173, strictPort: true, host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    // Keep browser authentication same-origin. Production hosting must proxy
    // these same paths to Elysia; no credentials are bundled into this client.
    proxy: { "/api": { target: process.env.CLIENT_API_PROXY_TARGET ?? "http://127.0.0.1:3001", changeOrigin: false } },
  },
  build: { target: "safari15.4" },
});
