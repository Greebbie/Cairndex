import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { createWithAutoAccept } from "../src/inbox/createWithAutoAccept.js";

let repo: string;
let home: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cairn-autoaccept-"));
  home = mkdtempSync(join(tmpdir(), "cairn-autoaccept-home-"));
  process.env.CAIRNDEX_HOME = home;
  // Minimal vault layout the helper needs.
  for (const sub of ["specs", "decisions", "insights", "tasks", "changes", "inbox/proposed-memory-updates"]) {
    mkdirSync(join(repo, ".cairndex", sub), { recursive: true });
  }
  writeFileSync(join(repo, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.CAIRNDEX_HOME;
});

function setThreshold(value: number | null) {
  // The helper reads via readUserPreferences which honors CAIRNDEX_HOME.
  // We write the YAML directly so tests don't depend on writeUserPreferences.
  if (value === null) {
    rmSync(join(home, "preferences.yaml"), { force: true });
    return;
  }
  writeFileSync(
    join(home, "preferences.yaml"),
    `schemaVersion: 1\nautoAcceptConfidenceThreshold: ${value}\n`,
    "utf8",
  );
}

describe("createWithAutoAccept", () => {
  it("returns autoAccepted: false when threshold is unset (default behavior preserved)", async () => {
    setThreshold(null);
    const result = await createWithAutoAccept(repo, defaultConfig(), {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "T", status: "active", created: "2026-05-03" },
      newBody: "body",
      summary: "test",
      reason: "reason",
      provenance: { createdBy: "test", session: "s", confidence: 0.9 },
    });
    expect(result.autoAccepted).toBe(false);
    expect(result.applied).toBeUndefined();
    expect(result.thresholdAtDecision).toBeNull();
    // Proposal is in pending status — durable insight NOT created.
    const propPath = result.path;
    expect(existsSync(propPath)).toBe(true);
    expect(readFileSync(propPath, "utf8")).toMatch(/status:\s*pending/);
  });

  it("returns autoAccepted: false when confidence is below threshold", async () => {
    setThreshold(0.85);
    const result = await createWithAutoAccept(repo, defaultConfig(), {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "T", status: "active", created: "2026-05-03" },
      newBody: "body",
      summary: "test",
      reason: "reason",
      provenance: { createdBy: "test", session: "s", confidence: 0.6 },
    });
    expect(result.autoAccepted).toBe(false);
    expect(result.applied).toBeUndefined();
    expect(result.thresholdAtDecision).toBe(0.85);
  });

  it("auto-accepts when confidence is at or above threshold; durable file created + changelog logs Auto-accepted", async () => {
    setThreshold(0.5);
    const result = await createWithAutoAccept(repo, defaultConfig(), {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "Auto-accepted insight", status: "active", created: "2026-05-03" },
      newBody: "body",
      summary: "test",
      reason: "reason",
      provenance: { createdBy: "test", session: "s", confidence: 0.6 },
    });
    expect(result.autoAccepted).toBe(true);
    expect(result.applied).toBeDefined();
    expect(result.applied?.action).toBe("created");
    // Proposal frontmatter now reflects auto-accept.
    const propRaw = readFileSync(result.path, "utf8");
    expect(propRaw).toMatch(/status:\s*accepted/);
    expect(propRaw).toMatch(/acceptedBy:\s*auto/);
    // Durable insight exists.
    expect(result.applied?.targetPath).toBeDefined();
    if (result.applied) expect(existsSync(result.applied.targetPath)).toBe(true);
    // Changelog records Auto-accepted (not just Accepted).
    const log = readFileSync(join(repo, ".cairndex/changes/changelog.md"), "utf8");
    expect(log).toMatch(/Auto-accepted/);
  });

  it("does not auto-accept when proposal has no numeric confidence (manual submissions)", async () => {
    setThreshold(0.5);
    const result = await createWithAutoAccept(repo, defaultConfig(), {
      proposalType: "create",
      targetType: "insight",
      newFrontmatter: { title: "Manual", status: "active", created: "2026-05-03" },
      newBody: "body",
      summary: "test",
      reason: "reason",
      // No confidence in provenance (manual via CLI propose).
      provenance: { createdBy: "user", session: "manual" },
    });
    expect(result.autoAccepted).toBe(false);
    expect(readFileSync(result.path, "utf8")).toMatch(/status:\s*pending/);
  });

  it("falls back to autoAccepted: false when accept stage throws (proposal still persisted)", async () => {
    setThreshold(0.5);
    // Update proposal with a target that doesn't exist → acceptProposal will throw.
    // The helper must not roll back the proposal creation.
    const result = await createWithAutoAccept(repo, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-999", // does not exist
      newFrontmatter: {},
      newBody: "new body",
      summary: "test",
      reason: "reason",
      provenance: { createdBy: "test", session: "s", confidence: 0.9 },
    });
    expect(result.autoAccepted).toBe(false);
    // Proposal file still exists in pending — user can review manually.
    expect(existsSync(result.path)).toBe(true);
    expect(readFileSync(result.path, "utf8")).toMatch(/status:\s*pending/);
  });
});
