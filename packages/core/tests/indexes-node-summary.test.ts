import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildNodeSummary, regenerateNodeSummary } from "../src/indexes/nodeSummary.js";
import { nodeSummaryPath } from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-ns-"));
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

describe("buildNodeSummary", () => {
  it("returns an empty list when the vault has no node files", async () => {
    setup({});
    const summary = await buildNodeSummary(tmp, defaultConfig());
    expect(summary.nodes).toEqual([]);
    expect(summary.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("collects node id/type/title/status across all node folders", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Memory Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\n",
      "decisions/ADR-001.md":
        "---\nid: ADR-001\ntitle: A Decision\nstatus: accepted\ncreated: 2026-05-01\n---\n",
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Some Task\nstatus: pending\ncreated: 2026-05-02\nupdated: 2026-05-02\n---\n",
    });
    const summary = await buildNodeSummary(tmp, defaultConfig());
    const ids = summary.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["ADR-001", "SPEC-001", "TASK-001"]);

    const spec = summary.nodes.find((n) => n.id === "SPEC-001");
    expect(spec).toMatchObject({
      id: "SPEC-001",
      type: "spec",
      title: "Memory Cockpit",
      status: "active",
    });
  });

  it("captures provenance.confidence and last_verified when present", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\nprovenance:\n  confidence: 0.85\n  last_verified: 2026-05-01\n---\n",
    });
    const summary = await buildNodeSummary(tmp, defaultConfig());
    const spec = summary.nodes[0];
    expect(spec?.confidence).toBe(0.85);
    expect(spec?.lastVerified).toBe("2026-05-01");
  });

  it("computes freshnessDays from updated relative to today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    setup({
      "specs/SPEC-001.md": `---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: ${today}\nupdated: ${today}\n---\n`,
    });
    const summary = await buildNodeSummary(tmp, defaultConfig());
    expect(summary.nodes[0]?.freshnessDays).toBe(0);
  });
});

describe("regenerateNodeSummary", () => {
  it("writes node-summary.json to indexes/", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const result = await regenerateNodeSummary(tmp, defaultConfig());
    expect(result.changed).toBe(true);
    expect(existsSync(nodeSummaryPath(tmp))).toBe(true);
    const written = JSON.parse(readFileSync(nodeSummaryPath(tmp), "utf8"));
    expect(written.nodes).toHaveLength(1);
  });

  it("is idempotent across runs (changed=false on identical content)", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    await regenerateNodeSummary(tmp, defaultConfig());
    const result = await regenerateNodeSummary(tmp, defaultConfig());
    expect(result.changed).toBe(false);
  });
});
