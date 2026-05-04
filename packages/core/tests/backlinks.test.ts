import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeBacklinks } from "../src/backlinks.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-bl-"));
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

describe("backlinks", () => {
  it("collects typed-edge backlinks from frontmatter links", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "decisions/ADR-001-a.md":
        "---\nid: ADR-001\ntitle: A\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    expect(idx.get("SPEC-001")).toEqual([
      { from: "ADR-001", fromType: "decision", type: "implements" },
    ]);
  });

  it("collects string-style frontmatter links", async () => {
    setup({
      "plans/PLAN-001-a.md":
        "---\nid: PLAN-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "tasks/TASK-001-a.md":
        "---\nid: TASK-001\ntitle: A\nstatus: pending\ncreated: 2026-04-30\nupdated: 2026-04-30\nlinks:\n  - PLAN-001\n---\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    expect(idx.get("PLAN-001")).toContainEqual({
      from: "TASK-001",
      fromType: "task",
      type: "links",
    });
  });

  it("collects [[wikilinks]] from body as 'mentions' edges", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "sessions/2026-04-30-1530.md":
        "---\nid: 2026-04-30-1530\ndate: 2026-04-30\nsummary: ok\n---\n\nTouched [[SPEC-001]] today.\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    const refs = idx.get("SPEC-001") ?? [];
    expect(refs).toContainEqual({ from: "2026-04-30-1530", fromType: "session", type: "mentions" });
  });

  it("returns empty entry for nodes with no backlinks", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    expect(idx.get("SPEC-001") ?? []).toEqual([]);
  });
});
