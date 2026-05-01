import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "..", "web", "dist");
const dest = resolve(here, "..", "dist", "web");

if (!existsSync(src)) {
  console.error(`copy-web: source ${src} does not exist. Run 'pnpm -F @cairndex/web build' first.`);
  process.exit(1);
}
cpSync(src, dest, { recursive: true });
console.log(`copy-web: ${src} -> ${dest}`);
