import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runValidation } from "../src/validate/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-val-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function vaultDir(): string {
  const d = join(tmp, ".cairndex");
  mkdirSync(d, { recursive: true });
  mkdirSync(join(d, "specs"), { recursive: true });
  mkdirSync(join(d, "decisions"), { recursive: true });
  return d;
}

describe("validate", () => {
  it("flags missing required field as error", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\n---\n",
    );
    // missing `updated`
    const issues = await runValidation(tmp, defaultConfig());
    expect(
      issues.some(
        (i) => i.rule === "schema-required" && i.severity === "error" && i.nodeId === "SPEC-001",
      ),
    ).toBe(true);
  });

  it("flags filename/frontmatter id mismatch as error", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-002\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "id-consistency" && i.severity === "error")).toBe(true);
  });

  it("flags broken supersedes link as error", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: superseded\ncreated: 2026-04-30\nlinks:\n  - { type: superseded_by, target: ADR-999 }\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "reference-integrity" && i.severity === "error")).toBe(
      true,
    );
  });

  it("flags status: done without verification block as error", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "verification-bound" && i.severity === "error")).toBe(
      true,
    );
  });

  it("flags duplicate id collision as error", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-y.md"),
      "---\nid: SPEC-001\ntitle: Y\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "id-collision" && i.severity === "error")).toBe(true);
  });

  it("warns when provenance block is missing", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "provenance-present" && i.severity === "warn")).toBe(true);
  });

  it("returns no errors on a fully valid spec", async () => {
    vaultDir();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: claude\n  session: 2026-04-30-1530\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
