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

  it("uses task as a label only — selection is identical regardless of task string", async () => {
    setup({
      "index.md": baseIndex,
      "specs/SPEC-001.md":
        "---\nid: SPEC-001\ntitle: Cockpit\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nspec\n",
    });
    const a = await buildContextPack(tmp, defaultConfig(), { task: "fix e2e" });
    const b = await buildContextPack(tmp, defaultConfig(), { task: "totally unrelated" });
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });
});
