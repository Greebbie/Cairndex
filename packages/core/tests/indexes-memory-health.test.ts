import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildMemoryHealth, regenerateMemoryHealth } from "../src/indexes/memoryHealth.js";
import { memoryHealthPath } from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-mh-"));
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

describe("buildMemoryHealth", () => {
  it("returns all-green counts for an empty vault", async () => {
    setup({});
    const health = await buildMemoryHealth(tmp, defaultConfig());
    expect(health.counts.red).toBe(0);
    expect(health.counts.yellow).toBe(0);
    expect(health.counts.green).toBe(0);
    expect(health.issues).toEqual([]);
  });

  it("classifies a healthy spec as green", async () => {
    const today = new Date().toISOString().slice(0, 10);
    setup({
      "specs/SPEC-001.md": `---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: ${today}\nupdated: ${today}\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n`,
    });
    const health = await buildMemoryHealth(tmp, defaultConfig());
    expect(health.counts.green).toBe(1);
    expect(health.counts.red).toBe(0);
    expect(health.counts.yellow).toBe(0);
  });

  it("classifies a stale spec as yellow (freshness warning)", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2025-01-01\nupdated: 2025-01-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    const health = await buildMemoryHealth(tmp, defaultConfig());
    expect(health.counts.yellow).toBe(1);
    expect(health.counts.red).toBe(0);
    expect(health.issues.some((i) => i.rule === "freshness")).toBe(true);
  });

  it("classifies an accepted decision without verification as red (error)", async () => {
    setup({
      "decisions/ADR-001.md":
        "---\nid: ADR-001\ntitle: A\nstatus: accepted\ncreated: 2026-05-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    const health = await buildMemoryHealth(tmp, defaultConfig());
    expect(health.counts.red).toBe(1);
    expect(health.issues.some((i) => i.rule === "verification-bound")).toBe(true);
  });

  it("only aggregates health-relevant rules (skips reference-integrity etc.)", async () => {
    // Create a spec linking to nonexistent target — reference-integrity would error.
    // Memory health should ignore it.
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\nlinks:\n  - { type: implements, target: GOAL-999 }\n---\n",
    });
    const health = await buildMemoryHealth(tmp, defaultConfig());
    expect(health.issues.some((i) => i.rule === "reference-integrity")).toBe(false);
  });
});

describe("regenerateMemoryHealth", () => {
  it("writes memory-health.json to indexes/", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    const result = await regenerateMemoryHealth(tmp, defaultConfig());
    expect(result.changed).toBe(true);
    expect(existsSync(memoryHealthPath(tmp))).toBe(true);
    const written = JSON.parse(readFileSync(memoryHealthPath(tmp), "utf8"));
    expect(written.counts).toBeDefined();
  });

  it("is idempotent across runs", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\nprovenance:\n  created_by: claude\n  session: 2026-05-02-0125\n---\n",
    });
    await regenerateMemoryHealth(tmp, defaultConfig());
    const result = await regenerateMemoryHealth(tmp, defaultConfig());
    expect(result.changed).toBe(false);
  });
});
