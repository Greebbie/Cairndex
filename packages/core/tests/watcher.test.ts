import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { createWatcher } from "../src/watcher.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-watch-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function wait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

describe("watcher", () => {
  it("emits change events when a tracked file is written", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 50,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    await wait(500);
    await watcher.stop();
    expect(events.some((p) => p.endsWith("SPEC-001-x.md"))).toBe(true);
  });

  it("debounces rapid writes to the same file", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 100,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    const f = join(tmp, ".cairndex/specs/SPEC-002-y.md");
    for (let i = 0; i < 5; i++) {
      writeFileSync(f, `# v${i}\n`);
      await wait(20);
    }
    await wait(500);
    await watcher.stop();
    const matching = events.filter((p) => p.endsWith("SPEC-002-y.md"));
    // 5 writes within 100ms debounce should collapse — exact count platform-dependent
    expect(matching.length).toBeLessThanOrEqual(2);
  });

  it("ignores files outside .cairndex/", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 50,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    writeFileSync(join(tmp, "outside.md"), "x\n");
    await wait(500);
    await watcher.stop();
    expect(events.filter((p) => p.includes("outside.md"))).toEqual([]);
  });
});
