import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { runValidation } from "../src/validate/index.js";
import { confidenceLow } from "../src/validate/rules/confidence-low.js";
import { phaseCoherence } from "../src/validate/rules/phase-coherence.js";
import { unknownFolder } from "../src/validate/rules/unknown-folder.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-vex-"));
  mkdirSync(join(tmp, ".cairndex"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("validate extra rules", () => {
  it("phase-coherence warns when phase is implementing but plans/ is empty", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/index.md"), "---\nphase: implementing\n---\n# index\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [phaseCoherence] });
    expect(issues.some((i) => i.rule === "phase-coherence" && i.severity === "warn")).toBe(true);
  });

  it("phase-coherence does not warn when phase is implementing and plans/ has files", async () => {
    mkdirSync(join(tmp, ".cairndex/plans"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/plans/PLAN-001.md"),
      "---\nid: PLAN-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    writeFileSync(join(tmp, ".cairndex/index.md"), "---\nphase: implementing\n---\n# index\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [phaseCoherence] });
    expect(issues.filter((i) => i.rule === "phase-coherence")).toEqual([]);
  });

  it("unknown-folder warns on a folder not in config", async () => {
    mkdirSync(join(tmp, ".cairndex/experiments"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/experiments/X-001.md"), "---\nid: X-001\ntitle: x\n---\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [unknownFolder] });
    expect(issues.some((i) => i.rule === "unknown-folder")).toBe(true);
  });

  it("unknown-folder does not warn on archive/ or templates/ or rules/", async () => {
    mkdirSync(join(tmp, ".cairndex/archive"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/rules"), { recursive: true });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [unknownFolder] });
    expect(issues.filter((i) => i.rule === "unknown-folder")).toEqual([]);
  });

  it("unknown-folder does not warn on a folder declared via config.node_types", async () => {
    mkdirSync(join(tmp, ".cairndex/experiments"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/config.yaml"),
      "schemaVersion: 1\nnode_types:\n  experiment:\n    folder: experiments\n    id_prefix: EXP\n",
      "utf8",
    );
    const issues = await runValidation(tmp, defaultConfig(), { rules: [unknownFolder] });
    expect(issues.filter((i) => i.rule === "unknown-folder")).toEqual([]);
  });

  it("confidence-low emits info on low-confidence node referenced by an active spec", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nlinks:\n  - { type: implements, target: ADR-001 }\n---\n",
    );
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: accepted\ncreated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n  confidence: 0.3\n---\n",
    );
    const issues = await runValidation(tmp, defaultConfig(), { rules: [confidenceLow] });
    expect(issues.some((i) => i.rule === "confidence-low" && i.nodeId === "ADR-001")).toBe(true);
  });
});
