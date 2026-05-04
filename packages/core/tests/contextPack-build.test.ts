import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { buildContextPack } from "../src/contextPack/build.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cpb-"));
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

const baseIndex = `---
phase: implementing
phase_since: 2026-04-30
next_action: "Run cairndex doctor --fix"
---

# Project Index
`;

describe("buildContextPack", () => {
  it("includes a project-state item when index.md has phase/active info", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Memory Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-02\n---\n\nspec body\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "fix web e2e" });
    expect(pack.items[0]?.id).toBe("PROJECT-STATE");
    expect(pack.items[0]?.reason).toMatch(/project state/i);
    expect(pack.items.some((i) => i.id === "SPEC-001" && /active spec/.test(i.reason))).toBe(true);
  });

  it("includes the most recent N sessions ordered newest-first", async () => {
    setup({
      "index.md": baseIndex,
      "sessions/2026-05-01-1000.md":
        "---\nid: 2026-05-01-1000\ndate: 2026-05-01\nsummary: 'first attempt'\n---\nbody\n",
      "sessions/2026-05-02-1500.md":
        "---\nid: 2026-05-02-1500\ndate: 2026-05-02\nsummary: 'second attempt'\n---\nbody\n",
      "sessions/2026-05-02-1700.md":
        "---\nid: 2026-05-02-1700\ndate: 2026-05-02\nsummary: 'third attempt'\n---\nbody\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), {
      task: "x",
      recentSessionsLimit: 2,
    });
    const sessionItems = pack.items.filter((i) => i.type === "session");
    expect(sessionItems).toHaveLength(2);
    expect(sessionItems[0]?.id).toBe("2026-05-02-1700");
    expect(sessionItems[1]?.id).toBe("2026-05-02-1500");
  });

  it("includes open questions", async () => {
    setup({
      "index.md": baseIndex,
      "questions/QUESTION-001.md":
        "---\nid: QUESTION-001\ntitle: 'Config semantics'\nstatus: open\ncreated: 2026-05-02\n---\nbody\n",
      "questions/QUESTION-002.md":
        "---\nid: QUESTION-002\ntitle: 'Old answered'\nstatus: answered\ncreated: 2026-05-02\n---\nbody\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "x" });
    expect(pack.items.some((i) => i.id === "QUESTION-001")).toBe(true);
    expect(pack.items.some((i) => i.id === "QUESTION-002")).toBe(false);
  });

  it("includes decisions backlinked to the active spec", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n",
      "decisions/ADR-005.md":
        "---\nid: ADR-005\ntitle: Storage choice\nstatus: accepted\ncreated: 2026-05-01\nverification:\n  commit: abc1234\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\nbody\n",
      "decisions/ADR-006.md":
        "---\nid: ADR-006\ntitle: Unrelated\nstatus: accepted\ncreated: 2026-05-01\nverification:\n  commit: def5678\n---\nbody\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "x" });
    expect(pack.items.some((i) => i.id === "ADR-005")).toBe(true);
    expect(pack.items.some((i) => i.id === "ADR-006")).toBe(false);
  });

  it("auto-includes operating-rule items from rules/ in the pack with high priority", async () => {
    setup({
      "index.md": baseIndex,
      "rules/operating-rules.md": "# Operating rules\n\nDo X. Do Y.\n",
      "rules/team-conventions.md": "# Team conventions\n\nLink spec → goal.\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "x" });
    const ruleItems = pack.items.filter((i) => i.type === "operating-rule");
    expect(ruleItems).toHaveLength(2);
    // Sorted alphabetically by id, so operating-rules comes before team-conventions
    expect(ruleItems[0]?.id).toBe("rule:operating-rules");
    expect(ruleItems[1]?.id).toBe("rule:team-conventions");
    expect(ruleItems[0]?.body).toContain("Do X");
    // Priority 1 means never trimmed
    for (const r of ruleItems) expect(r.reasonPriority).toBe(1);
  });

  it("caps each operating-rule body so an oversize rule doesn't blow the budget", async () => {
    const huge = `# Big rule\n\n${"x".repeat(5000)}`;
    setup({
      "index.md": baseIndex,
      "rules/big.md": huge,
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "x" });
    const ruleItem = pack.items.find((i) => i.id === "rule:big");
    expect(ruleItem).toBeDefined();
    // body got truncated below the original length
    expect(ruleItem!.body.length).toBeLessThan(huge.length);
    expect(ruleItem!.body).toContain("(truncated");
  });

  it("leaves selection unchanged when the task hint does not match any node", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nspec\n",
    });
    const a = await buildContextPack(tmp, defaultConfig(), { task: "fix e2e" });
    const b = await buildContextPack(tmp, defaultConfig(), { task: "totally unrelated" });
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });

  it("uses a direct task id as a focus hint and pulls linked plan/spec plus memory", async () => {
    setup({
      "index.md": baseIndex,
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Current task\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\ncurrent\n",
      "tasks/TASK-002.md":
        "---\nid: TASK-002\ntitle: Requested task\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\nlinks:\n  - PLAN-009\n  - { type: implements, target: SPEC-009 }\n---\nrequested\n",
      "plans/PLAN-009.md":
        "---\nid: PLAN-009\ntitle: Requested plan\nstatus: draft\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nplan\n",
      "specs/SPEC-009.md":
        "---\nid: SPEC-009\ntitle: Requested spec\nstatus: planned\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nspec\n",
      "decisions/ADR-009.md":
        "---\nid: ADR-009\ntitle: Requested decision\nstatus: accepted\ncreated: 2026-05-01\nverification:\n  commit: abc1234\nlinks:\n  - { type: implements, target: SPEC-009 }\n---\ndecision\n",
      "insights/INS-009.md":
        "---\nid: INS-009\ntitle: Requested insight\nstatus: stable\ncreated: 2026-05-01\nlinks:\n  - { type: implements, target: SPEC-009 }\n---\ninsight\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "TASK-002" });
    const reasons = new Map(pack.items.map((i) => [i.id, i.reason]));
    expect(reasons.get("TASK-001")).toMatch(/current task/);
    expect(reasons.get("TASK-002")).toMatch(/requested by context hint/);
    expect(reasons.get("PLAN-009")).toMatch(/linked from requested TASK-002/);
    expect(reasons.get("SPEC-009")).toMatch(/linked from requested TASK-002/);
    expect(reasons.get("ADR-009")).toMatch(/linked from SPEC-009/);
    expect(reasons.get("INS-009")).toMatch(/linked insight for SPEC-009/);
  });

  it("matches a strong task-title hint when no direct id is provided", async () => {
    setup({
      "index.md": baseIndex,
      "tasks/TASK-001.md":
        "---\nid: TASK-001\ntitle: Current task\nstatus: in_progress\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\ncurrent\n",
      "tasks/TASK-050.md":
        "---\nid: TASK-050\ntitle: Fix browser auth flow\nstatus: pending\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nrequested\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "browser auth flow" });
    const requested = pack.items.find((i) => i.id === "TASK-050");
    expect(requested?.reason).toMatch(/requested by context hint/);
  });

  it("includes insights backlinked to the active spec", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nspec\n",
      "insights/INS-001.md":
        "---\nid: INS-001\ntitle: Useful pattern\nstatus: stable\ncreated: 2026-05-01\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\ninsight\n",
    });
    const pack = await buildContextPack(tmp, defaultConfig(), { task: "x" });
    expect(pack.items.some((i) => i.id === "INS-001" && /linked insight/.test(i.reason))).toBe(
      true,
    );
  });
});
