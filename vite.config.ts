import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * Marshmallow Commons renderer build.
 *
 * Two pb-core access paths (DR-006, swappable transport):
 *   - Packaged Electron: the renderer reaches pb-core ONLY through the main process
 *     (single trusted egress; Chromium webSecurity stays ON). See electron/main.cjs.
 *   - Dev browser origin: this dev server proxies /v1/* to pb-core so requests are
 *     same-origin (no file:// CORS), which also makes the surface browser-drivable
 *     for observe-the-running-surface verification.
 *
 * `base: "./"` keeps asset URLs relative so the production bundle loads correctly
 * from Electron's file:// in the packaged app.
 */
const PB_CORE = process.env.MMC_PBCORE_ORIGIN ?? "http://127.0.0.1:7320";
const MC_ENGINE = process.env.MMC_ENGINE_ORIGIN ?? "http://127.0.0.1:7330";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin proxy to pb-core for the dev browser origin. SSE (/v1/stream)
      // rides through as a streamed response (no buffering).
      "/v1": {
        target: PB_CORE,
        changeOrigin: true,
        ws: false,
      },
      // Same-origin proxy to the local gated engine (the acting half). In the
      // packaged app the renderer reaches the engine via Electron IPC instead.
      "/api": {
        target: MC_ENGINE,
        changeOrigin: true,
        ws: false,
      },
    },
  },
  // Static preview (vite preview) — NO HMR websocket, so the page reaches network-
  // idle and the in-app preview panel / screenshot pipeline works. Same /v1 proxy to
  // pb-core so live data flows. Used by the `serve:preview` script for verification.
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: {
      "/v1": {
        target: PB_CORE,
        changeOrigin: true,
        ws: false,
      },
      "/api": {
        target: MC_ENGINE,
        changeOrigin: true,
        ws: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "chrome120",
  },
});
