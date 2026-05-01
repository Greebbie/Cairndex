import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// At runtime, this module is at:
//   <pkg-root>/dist/bin.cjs (after build) or via vitest from src/utils/.
// We look for `templates/` adjacent to either the package root or two levels up
// (for monorepo dev where templates/ is at the repo root).
export function findBundledTemplatesDir(): string {
  const here =
    typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));

  const candidates = [
    join(here, "..", "templates"), // packaged: <pkg>/templates next to dist
    join(here, "..", "..", "templates"), // monorepo dev: <repo-root>/templates
    join(here, "..", "..", "..", "templates"),
    join(here, "..", "..", "..", "..", "templates"),
    resolve(process.cwd(), "templates"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error("bundled templates directory not found");
}
