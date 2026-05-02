import { defineConfig } from "tsup";

// Separate build for the Node SEA entrypoint. The SEA exe has no node_modules
// at runtime, so EVERYTHING runtime-required must be bundled into the blob.
//
// Caveat: pino-pretty cannot be cleanly bundled (its transport spawns a worker
// that resolves `lib/worker.js` from disk). The SEA logger detects SEA via
// `node:sea` and falls back to raw pino without transport, sidestepping that.
export default defineConfig({
  entry: ["src/sea-entry.ts"],
  format: ["cjs"],
  outDir: "dist-sea-entry",
  outExtension: () => ({ js: ".cjs" }),
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  shims: true,
  // SEA blobs cannot contain a shebang — the JS runtime sees it as a syntax
  // error inside the embedded blob. Tsup's default banner adds one for ESM/
  // CJS bin output; suppress here.
  banner: { js: "" },
  noExternal: [/.*/],
});
