import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSyncCmd } from "../src/commands/sync.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-sync-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
  mkdirSync(join(home, "shared/rules"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/rules"), { recursive: true });
});
afterEach(() => {
  Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("sync command", () => {
  it("fast-forwards when only global changed", async () => {
    writeFileSync(join(home, "shared/rules/operating-rules.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/rules/operating-rules.md"), "v1\n");
    writeFileSync(
      join(tmp, ".cairndex/.sync-baseline.json"),
      JSON.stringify({
        hashes: {
          "rules/operating-rules.md": createHash("sha256").update("v1\n").digest("hex"),
        },
      }),
    );
    writeFileSync(join(home, "shared/rules/operating-rules.md"), "v2\n");
    const r = await runSyncCmd({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(tmp, ".cairndex/rules/operating-rules.md"), "utf8")).toBe("v2\n");
  });

  it("returns exit code 1 when conflicts exist", async () => {
    writeFileSync(join(home, "shared/rules/r.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/rules/r.md"), "v1\n");
    writeFileSync(
      join(tmp, ".cairndex/.sync-baseline.json"),
      JSON.stringify({
        hashes: { "rules/r.md": createHash("sha256").update("v1\n").digest("hex") },
      }),
    );
    writeFileSync(join(home, "shared/rules/r.md"), "v-global\n");
    writeFileSync(join(tmp, ".cairndex/rules/r.md"), "v-local\n");
    const r = await runSyncCmd({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(tmp, ".cairndex/.sync-conflicts/rules/r.md"))).toBe(true);
  });
});
