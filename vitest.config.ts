import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/tests/**/*.test.ts"],
    // .tsx web tests run under the web package's own vitest config (jsdom environment).
    // Excluding them here prevents accidental coverage attempts in the wrong env.
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/**/*.test.tsx", "**/tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/**/src/**"],
    },
  },
});
