import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  shims: true,
  banner: { js: "#!/usr/bin/env node" },
  // Bundle @cairndex/core (ESM-only) and js-yaml so that gray-matter's nested
  // js-yaml@3 (it calls yaml.safeLoad which was removed in js-yaml@4) is honored
  // via the bundler's nearest-parent resolution rather than the workspace-hoisted
  // js-yaml@4 that node would pick at runtime.
  noExternal: ["@cairndex/core", "@cairndex/server", "gray-matter", "js-yaml"],
});
