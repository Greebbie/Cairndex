import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7777",
    },
  },
  build: {
    outDir: "dist",
    // Full sourcemaps in dev/test, "hidden" in production: emits the .map alongside
    // the bundle for crash-report symbolication but does NOT add a `sourceMappingURL`
    // comment, so the source isn't fetched/exposed by the browser by default. The
    // Tauri desktop bundle wraps this output, so we don't want sources walkable from
    // the shipped app.
    sourcemap: process.env.NODE_ENV === "production" ? "hidden" : true,
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
  },
});
