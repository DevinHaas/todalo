import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
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
