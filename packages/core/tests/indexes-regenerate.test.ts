import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { regenerateAllIndexes } from "../src/indexes/regenerate.js";
import {
  activeContextPath,
  backlinksPath,
  memoryHealthPath,
  nodeSummaryPath,
} from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-rg-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function setup(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(tmp, ".cairndex", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

describe("regenerateAllIndexes", () => {
  it("writes all four index files when given a valid vault", async () => {
    setup({
      "index.md":
        "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'do thing'\n---\n# x\n",
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    const result = await regenerateAllIndexes(tmp, defaultConfig());
    expect(existsSync(activeContextPath(tmp))).toBe(true);
    expect(existsSync(nodeSummaryPath(tmp))).toBe(true);
    expect(existsSync(memoryHealthPath(tmp))).toBe(true);
    expect(existsSync(backlinksPath(tmp))).toBe(true);
    expect(result.changed.activeContext).toBe(true);
    expect(result.changed.nodeSummary).toBe(true);
    expect(result.changed.memoryHealth).toBe(true);
    expect(result.changed.backlinks).toBe(true);
  });

  it("reports no changes on identical re-run", async () => {
    setup({
      "index.md":
        "---\nphase: implementing\nphase_since: 2026-04-30\nnext_action: 'do thing'\n---\n# x\n",
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    await regenerateAllIndexes(tmp, defaultConfig());
    const second = await regenerateAllIndexes(tmp, defaultConfig());
    expect(second.changed.activeContext).toBe(false);
    expect(second.changed.nodeSummary).toBe(false);
    expect(second.changed.memoryHealth).toBe(false);
    expect(second.changed.backlinks).toBe(false);
    expect(second.anyChanged).toBe(false);
  });
});
