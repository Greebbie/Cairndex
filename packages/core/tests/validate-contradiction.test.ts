import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runValidation } from "../src/validate/index.js";
import { multipleActive } from "../src/validate/rules/multiple-active.js";
import { supersededActive } from "../src/validate/rules/superseded-active.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-contradiction-"));
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

describe("multipleActive rule", () => {
  it("flags two simultaneously active specs", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "specs/SPEC-002.md":
        "---\nid: SPEC-002\ntitle: B\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [multipleActive] });
    expect(issues).toHaveLength(2);
    expect(issues[0]?.rule).toBe("multiple-active");
    expect(issues[0]?.severity).toBe("warn");
  });

  it("does not flag when only one active spec exists", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "specs/SPEC-002.md":
        "---\nid: SPEC-002\ntitle: B\nstatus: superseded\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [multipleActive] });
    expect(issues).toHaveLength(0);
  });

  it("flags two active goals as well", async () => {
    setup({
      "goals/GOAL-001.md":
        "---\nid: GOAL-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\n---\n",
      "goals/GOAL-002.md":
        "---\nid: GOAL-002\ntitle: B\nstatus: active\ncreated: 2026-05-01\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [multipleActive] });
    expect(issues).toHaveLength(2);
    expect(issues[0]?.nodeType).toBe("goal");
  });
});

describe("supersededActive rule", () => {
  it("flags an active spec that is also superseded_by something", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Old\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - { type: superseded_by, target: SPEC-002 }\n---\n",
      "specs/SPEC-002.md":
        "---\nid: SPEC-002\ntitle: New\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [supersededActive] });
    const target = issues.find((i) => i.nodeId === "SPEC-001");
    expect(target).toBeDefined();
    expect(target?.severity).toBe("error");
    expect(target?.message).toMatch(/superseded_by/);
  });

  it("flags an accepted decision that is also superseded_by something", async () => {
    setup({
      "decisions/ADR-001.md":
        "---\nid: ADR-001\ntitle: Old ADR\nstatus: accepted\ncreated: 2026-05-01\nverification:\n  commit: abc\nlinks:\n  - { type: superseded_by, target: ADR-002 }\n---\n",
      "decisions/ADR-002.md":
        "---\nid: ADR-002\ntitle: New ADR\nstatus: accepted\ncreated: 2026-05-01\nverification:\n  commit: def\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [supersededActive] });
    expect(issues.some((i) => i.nodeId === "ADR-001")).toBe(true);
  });

  it("does not flag when superseded node has status: superseded", async () => {
    setup({
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Old\nstatus: superseded\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - { type: superseded_by, target: SPEC-002 }\n---\n",
      "specs/SPEC-002.md":
        "---\nid: SPEC-002\ntitle: New\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
    });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [supersededActive] });
    expect(issues).toHaveLength(0);
  });
});
