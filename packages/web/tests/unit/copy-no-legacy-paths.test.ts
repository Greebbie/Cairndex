import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_ROOT = resolve(__dirname, "..", "..", "src");

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && /\.(ts|tsx)$/.test(name)) {
      yield full;
    }
  }
}

describe("web copy", () => {
  it("does not hardcode '.cairndex/' anywhere under src/", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      if (/\.cairndex\//.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
