import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposeStaleNodeArchives } from "../src/archiveProposer/index.js";
import { defaultConfig } from "../src/config.js";
import { listProposals } from "../src/inbox/read.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-archprop-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/tasks"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/plans"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeNodeFile(
  folder: string,
  id: string,
  fm: Record<string, unknown>,
  body: string,
): void {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        lines.push(`  ${k2}: ${JSON.stringify(v2)}`);
      }
    } else {
      lines.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  lines.push("---", "");
  writeFileSync(join(tmp, folder, `${id}.md`), `${lines.join("\n")}${body}\n`, "utf8");
}

describe("proposeStaleNodeArchives", () => {
  it("drafts an archive proposal for an old, low-confidence, unverified node", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-005",
      {
        id: "SPEC-005",
        title: "Old draft spec",
        status: "draft",
        created: "2025-01-01",
        updated: "2025-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "old experimental thinking\n",
    );

    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(1);

    const inbox = await listProposals(tmp, defaultConfig());
    const draft = inbox.pending.find((p) => p.target === "SPEC-005");
    expect(draft).toBeDefined();
    expect(draft?.proposalType).toBe("update");
    expect(draft?.targetType).toBe("spec");
    expect(draft?.summary).toMatch(/SPEC-005/);
    expect(draft?.reason).toMatch(/180/);
    expect(draft?.newFrontmatter?.status).toBe("archived");
  });

  it("skips verified nodes (status=stable / done / etc.)", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-006",
      {
        id: "SPEC-006",
        title: "Old stable spec",
        status: "stable",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "shipped, stable\n",
    );
    writeNodeFile(
      ".cairndex/tasks",
      "TASK-007",
      {
        id: "TASK-007",
        title: "Old finished task",
        status: "done",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3, verified: true },
      },
      "done\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("skips high-confidence nodes regardless of age", async () => {
    writeNodeFile(
      ".cairndex/insights",
      "INS-008",
      {
        id: "INS-008",
        title: "Old high-confidence insight",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.9 },
      },
      "high confidence\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("skips fresh nodes (younger than ageDays)", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-009",
      {
        id: "SPEC-009",
        title: "Recent draft spec",
        status: "draft",
        created: "2026-04-01",
        updated: "2026-04-01",
        provenance: { created_by: "claude", session: "recent", confidence: 0.3 },
      },
      "recent draft\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("skips already-archived nodes", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-010",
      {
        id: "SPEC-010",
        title: "Already archived",
        status: "archived",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "archived\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("skips active nodes referenced via index.md (active goal/spec/plan/current task)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/index.md"),
      "---\nphase: implementing\nactive_spec: SPEC-011\n---\n# index\n",
      "utf8",
    );
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-011",
      {
        id: "SPEC-011",
        title: "Active but old draft",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "in flight\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("excludes session and change types (different lifecycle)", async () => {
    writeNodeFile(
      ".cairndex/sessions",
      "2024-01-01-1000",
      {
        id: "2024-01-01-1000",
        date: "2024-01-01",
        summary: "old session",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "old session body\n",
    );
    writeNodeFile(
      ".cairndex/changes",
      "CHG-012",
      {
        id: "CHG-012",
        title: "Old change",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "old change\n",
    );
    const result = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(result.proposalsCreated).toBe(0);
  });

  it("re-running is idempotent (no duplicate proposals)", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-013",
      {
        id: "SPEC-013",
        title: "Stale draft",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "stale\n",
    );
    const first = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    const second = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(first.proposalsCreated).toBe(1);
    expect(second.proposalsCreated).toBe(0);
    const dir = join(tmp, ".cairndex/inbox/proposed-memory-updates");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(1);
  });

  it("emits archive proposal whose body explains the three triggers", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-014",
      {
        id: "SPEC-014",
        title: "Stale",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "needs archive\n",
    );
    await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    const inbox = await listProposals(tmp, defaultConfig());
    const draft = inbox.pending.find((p) => p.target === "SPEC-014");
    expect(draft?.newBody).toMatch(/180|age/i);
    expect(draft?.newBody).toMatch(/confidence/i);
    expect(draft?.newBody).toMatch(/unverified|verified/i);
  });

  it("the proposal lives at inbox/proposed-memory-updates/PROP-NNN.md", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-015",
      {
        id: "SPEC-015",
        title: "Stale",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.3 },
      },
      "x\n",
    );
    await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    const dir = join(tmp, ".cairndex/inbox/proposed-memory-updates");
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir);
    expect(files.some((f) => /^PROP-\d+\.md$/.test(f))).toBe(true);
    const raw = readFileSync(join(dir, files.find((f) => /^PROP-\d+\.md$/.test(f)) ?? ""), "utf8");
    expect(raw).toContain("target: SPEC-015");
  });

  it("respects custom confidenceThreshold (e.g., 0.7 archives 0.6 nodes)", async () => {
    writeNodeFile(
      ".cairndex/specs",
      "SPEC-016",
      {
        id: "SPEC-016",
        title: "Mid-confidence stale",
        status: "draft",
        created: "2024-01-01",
        updated: "2024-01-01",
        provenance: { created_by: "claude", session: "old", confidence: 0.6 },
      },
      "x\n",
    );
    const lenient = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      confidenceThreshold: 0.5,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(lenient.proposalsCreated).toBe(0);

    rmSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true, force: true });
    mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });

    const strict = await proposeStaleNodeArchives(tmp, defaultConfig(), {
      ageDays: 180,
      confidenceThreshold: 0.7,
      now: new Date("2026-05-02T12:00:00Z"),
    });
    expect(strict.proposalsCreated).toBe(1);
  });
});
