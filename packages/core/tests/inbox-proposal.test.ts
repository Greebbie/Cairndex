import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, mergeConfig } from "../src/config.js";
import {
  acceptProposal,
  createProposal,
  findDuplicate,
  listProposals,
  rejectProposal,
} from "../src/inbox/index.js";
import { inboxProposalsPath } from "../src/paths.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-inbox-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("createProposal", () => {
  it("writes a markdown file with provenance + content hash", async () => {
    const r = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "Updated body content.\n",
      summary: "Tighten the language",
      reason: "User asked for clearer wording",
      provenance: { createdBy: "claude-code", session: "2026-05-02-1500", confidence: 0.7 },
    });
    expect(r.proposalId).toMatch(/^PROP-/);
    expect(existsSync(r.path)).toBe(true);
    const raw = readFileSync(r.path, "utf8");
    expect(raw).toContain("proposalType: update");
    expect(raw).toContain("target: SPEC-001");
    expect(raw).toContain("status: pending");
    expect(raw).toMatch(/contentHash:\s*\S+/);
  });

  it("auto-allocates sequential PROP- ids", async () => {
    const a = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "a",
      summary: "a",
      reason: "a",
      provenance: { createdBy: "claude", session: "s1" },
    });
    const b = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "b",
      summary: "b",
      reason: "b",
      provenance: { createdBy: "claude", session: "s1" },
    });
    expect(a.proposalId).not.toBe(b.proposalId);
  });
});

describe("findDuplicate", () => {
  it("flags an identical proposal as duplicate of the existing one", async () => {
    await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "same body",
      summary: "first",
      reason: "first",
      provenance: { createdBy: "claude", session: "s" },
    });
    const dup = await findDuplicate(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "same body",
    });
    expect(dup).toMatch(/^PROP-/);
  });

  it("returns null when no match", async () => {
    const dup = await findDuplicate(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-002",
      newBody: "different body",
    });
    expect(dup).toBeNull();
  });
});

describe("listProposals", () => {
  it("returns pending proposals first, ignores accepted/rejected", async () => {
    const a = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "p1",
      summary: "p1",
      reason: "p1",
      provenance: { createdBy: "claude", session: "s" },
    });
    const b = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-002",
      newBody: "p2",
      summary: "p2",
      reason: "p2",
      provenance: { createdBy: "claude", session: "s" },
    });
    // Reject b
    await rejectProposal(tmp, defaultConfig(), b.proposalId, "manual reject");
    const list = await listProposals(tmp, defaultConfig());
    expect(list.pending.map((p) => p.proposalId)).toContain(a.proposalId);
    expect(list.pending.map((p) => p.proposalId)).not.toContain(b.proposalId);
    expect(list.rejected.map((p) => p.proposalId)).toContain(b.proposalId);
  });
});

describe("acceptProposal — update", () => {
  it("replaces the target node body, preserves frontmatter, marks proposal accepted", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: Title\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nold body\n",
      "utf8",
    );
    const proposal = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "new body content\n",
      summary: "improve wording",
      reason: "clarity",
      provenance: { createdBy: "claude", session: "s" },
    });
    const r = await acceptProposal(tmp, defaultConfig(), proposal.proposalId);
    expect(r.targetPath).toBe(join(tmp, ".cairndex/specs/SPEC-001.md"));
    const updated = readFileSync(r.targetPath, "utf8");
    expect(updated).toContain("new body content");
    expect(updated).not.toContain("old body");
    // Frontmatter preserved
    expect(updated).toContain("id: SPEC-001");
    expect(updated).toContain("title: Title");

    const proposalRaw = readFileSync(proposal.path, "utf8");
    expect(proposalRaw).toContain("status: accepted");
  });

  it("merges newFrontmatter on update proposals (e.g., flipping status to archived)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-002.md"),
      "---\nid: SPEC-002\ntitle: Title\nstatus: draft\ncreated: 2024-01-01\nupdated: 2024-01-01\n---\nold body\n",
      "utf8",
    );
    const proposal = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-002",
      newFrontmatter: { status: "archived" },
      newBody: "archive reason\n",
      summary: "archive",
      reason: "stale",
      provenance: { createdBy: "claude", session: "s" },
    });
    await acceptProposal(tmp, defaultConfig(), proposal.proposalId);
    const updated = readFileSync(join(tmp, ".cairndex/specs/SPEC-002.md"), "utf8");
    expect(updated).toContain("status: archived");
    expect(updated).toContain("id: SPEC-002");
    expect(updated).toContain("archive reason");
  });

  it("returns an error when target is missing", async () => {
    const proposal = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-MISSING",
      newBody: "x",
      summary: "x",
      reason: "x",
      provenance: { createdBy: "claude", session: "s" },
    });
    await expect(acceptProposal(tmp, defaultConfig(), proposal.proposalId)).rejects.toThrow(
      /target.*not found/i,
    );
  });
});

describe("acceptProposal — create", () => {
  it("writes a new node file with auto-allocated id and marks proposal accepted", async () => {
    const proposal = await createProposal(tmp, defaultConfig(), {
      proposalType: "create",
      targetType: "spec",
      newFrontmatter: {
        title: "New spec",
        status: "active",
        created: "2026-05-02",
        updated: "2026-05-02",
      },
      newBody: "Body of the new spec.\n",
      summary: "create spec",
      reason: "agent proposed a new spec",
      provenance: { createdBy: "claude", session: "s" },
    });
    const r = await acceptProposal(tmp, defaultConfig(), proposal.proposalId);
    expect(existsSync(r.targetPath)).toBe(true);
    const created = readFileSync(r.targetPath, "utf8");
    expect(created).toMatch(/id:\s*SPEC-/);
    expect(created).toContain("New spec");
    expect(created).toContain("Body of the new spec.");
  });
});

describe("rejectProposal", () => {
  it("marks the proposal as rejected and stores the reason", async () => {
    const proposal = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "x",
      summary: "x",
      reason: "x",
      provenance: { createdBy: "claude", session: "s" },
    });
    await rejectProposal(tmp, defaultConfig(), proposal.proposalId, "not aligned with goal");
    const raw = readFileSync(proposal.path, "utf8");
    expect(raw).toContain("status: rejected");
    expect(raw).toContain("rejectionReason: not aligned with goal");
  });
});

describe("inbox path layout", () => {
  it("uses .cairndex/inbox/proposed-memory-updates/ for files", () => {
    expect(inboxProposalsPath(tmp).replace(/\\/g, "/")).toContain(
      ".cairndex/inbox/proposed-memory-updates",
    );
  });
});

describe("createProposal — patch mode", () => {
  it("resolves a patch against the current target body and snapshots newBody", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      [
        "---",
        "id: SPEC-001",
        "title: Title",
        "status: active",
        "created: 2026-05-01",
        "updated: 2026-05-01",
        "---",
        "Intro.",
        "",
        "## History",
        "- 2026-05-01: created",
        "",
      ].join("\n"),
      "utf8",
    );

    const r = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      patch: [
        {
          kind: "append-section",
          section: "## History",
          content: "- 2026-05-02: claude appended\n",
        },
      ],
      summary: "log entry",
      reason: "audit trail",
      provenance: { createdBy: "claude", session: "s" },
    });

    const raw = readFileSync(r.path, "utf8");
    expect(raw).toContain("patch:");
    expect(raw).toContain("append-section");
    expect(raw).toContain("## History");
    expect(raw).toContain("- 2026-05-01: created");
    expect(raw).toContain("- 2026-05-02: claude appended");
  });

  it("rejects when neither newBody nor patch is provided", async () => {
    await expect(
      createProposal(tmp, defaultConfig(), {
        proposalType: "update",
        targetType: "spec",
        target: "SPEC-001",
        summary: "x",
        reason: "x",
        provenance: { createdBy: "claude", session: "s" },
      } as never),
    ).rejects.toThrow(/newBody.*patch/i);
  });

  it("rejects when both newBody and patch are provided", async () => {
    await expect(
      createProposal(tmp, defaultConfig(), {
        proposalType: "update",
        targetType: "spec",
        target: "SPEC-001",
        newBody: "x",
        patch: [{ kind: "append-section", section: "## H", content: "y" }],
        summary: "x",
        reason: "x",
        provenance: { createdBy: "claude", session: "s" },
      }),
    ).rejects.toThrow(/exactly one of newBody.*patch/i);
  });

  it("rejects patch on create proposals", async () => {
    await expect(
      createProposal(tmp, defaultConfig(), {
        proposalType: "create",
        targetType: "spec",
        newFrontmatter: { title: "T", status: "draft" },
        patch: [{ kind: "append-section", section: "## H", content: "y" }],
        summary: "x",
        reason: "x",
        provenance: { createdBy: "claude", session: "s" },
      }),
    ).rejects.toThrow(/patch.*only.*update/i);
  });

  it("rejects patch when target file does not exist", async () => {
    await expect(
      createProposal(tmp, defaultConfig(), {
        proposalType: "update",
        targetType: "spec",
        target: "SPEC-MISSING",
        patch: [{ kind: "append-section", section: "## H", content: "y\n" }],
        summary: "x",
        reason: "x",
        provenance: { createdBy: "claude", session: "s" },
      }),
    ).rejects.toThrow(/target.*SPEC-MISSING.*not found/i);
  });

  it("readProposal round-trips the patch field through frontmatter", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: T\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nBody.\n\n## History\n- a\n",
      "utf8",
    );
    const created = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      patch: [{ kind: "append-section", section: "## History", content: "- b\n" }],
      summary: "s",
      reason: "r",
      provenance: { createdBy: "claude", session: "s" },
    });
    const list = await listProposals(tmp, defaultConfig());
    const p = list.pending.find((x) => x.proposalId === created.proposalId);
    expect(p).toBeDefined();
    expect(p?.patch).toEqual([{ kind: "append-section", section: "## History", content: "- b\n" }]);
  });

  it("re-applies patch at accept time against the current target body", async () => {
    const targetPath = join(tmp, ".cairndex/specs/SPEC-001.md");
    writeFileSync(
      targetPath,
      [
        "---",
        "id: SPEC-001",
        "title: T",
        "status: active",
        "created: 2026-05-01",
        "updated: 2026-05-01",
        "---",
        "## History",
        "- a",
        "",
        "## Notes",
        "n1",
        "",
      ].join("\n"),
      "utf8",
    );

    const created = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      patch: [{ kind: "append-section", section: "## History", content: "- b\n" }],
      summary: "log",
      reason: "audit",
      provenance: { createdBy: "claude", session: "s" },
    });

    // SIMULATE concurrent edit by user mid-flight
    writeFileSync(
      targetPath,
      [
        "---",
        "id: SPEC-001",
        "title: T",
        "status: active",
        "created: 2026-05-01",
        "updated: 2026-05-01",
        "---",
        "## History",
        "- a",
        "- a.5 (added by user)",
        "",
        "## Notes",
        "n1",
        "",
      ].join("\n"),
      "utf8",
    );

    await acceptProposal(tmp, defaultConfig(), created.proposalId);

    const final = readFileSync(targetPath, "utf8");
    expect(final).toContain("- a");
    expect(final).toContain("- a.5 (added by user)"); // user's edit preserved
    expect(final).toContain("- b"); // patch re-applied
    expect(final).toContain("## Notes");
  });

  it("returns an error when accepting a patch proposal whose target was deleted", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: T\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\n## History\n- a\n",
      "utf8",
    );
    const created = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      patch: [{ kind: "append-section", section: "## History", content: "- b\n" }],
      summary: "x",
      reason: "x",
      provenance: { createdBy: "claude", session: "s" },
    });
    rmSync(join(tmp, ".cairndex/specs/SPEC-001.md"));
    await expect(acceptProposal(tmp, defaultConfig(), created.proposalId)).rejects.toThrow(
      /target.*not found/i,
    );
  });
});

describe("immutable type enforcement", () => {
  beforeEach(() => {
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  });

  it("createProposal rejects update of an immutable type (decision)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/decisions/ADR-001.md"),
      "---\nid: ADR-001\ntitle: T\nstatus: accepted\ncreated: 2026-01-01\n---\nbody\n",
      "utf8",
    );
    await expect(
      createProposal(tmp, defaultConfig(), {
        proposalType: "update",
        targetType: "decision",
        target: "ADR-001",
        newBody: "tampered\n",
        summary: "x",
        reason: "x",
        provenance: { createdBy: "claude", session: "s" },
      }),
    ).rejects.toThrow(/immutable type 'decision'/);
  });

  it("createProposal allows create of an immutable type (decision)", async () => {
    const r = await createProposal(tmp, defaultConfig(), {
      proposalType: "create",
      targetType: "decision",
      newFrontmatter: { title: "New ADR", status: "accepted", created: "2026-05-03" },
      newBody: "Decision body.\n",
      summary: "new adr",
      reason: "new",
      provenance: { createdBy: "claude", session: "s" },
    });
    expect(r.proposalId).toMatch(/^PROP-/);
  });

  it("createProposal allows update of a mutable type (spec)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: T\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nbody\n",
      "utf8",
    );
    const r = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "new body\n",
      summary: "x",
      reason: "x",
      provenance: { createdBy: "claude", session: "s" },
    });
    expect(r.proposalId).toMatch(/^PROP-/);
  });

  it("acceptProposal rejects a legacy update proposal targeting an immutable type", async () => {
    writeFileSync(
      join(tmp, ".cairndex/sessions/2026-04-01-1000.md"),
      "---\nid: 2026-04-01-1000\ndate: 2026-04-01\nsummary: x\n---\noriginal session\n",
      "utf8",
    );
    const proposalPath = join(tmp, ".cairndex/inbox/proposed-memory-updates/PROP-099.md");
    writeFileSync(
      proposalPath,
      [
        "---",
        "id: PROP-099",
        "proposalType: update",
        "targetType: session",
        "target: 2026-04-01-1000",
        "status: pending",
        "summary: tamper",
        "reason: tamper",
        "contentHash: deadbeef",
        "created: 2026-05-03T00:00:00.000Z",
        "provenance:",
        "  created_by: legacy",
        "  session: legacy",
        "---",
        "tampered body",
        "",
      ].join("\n"),
      "utf8",
    );
    await expect(acceptProposal(tmp, defaultConfig(), "PROP-099")).rejects.toThrow(
      /immutable type 'session'/,
    );
  });

  it("acceptProposal honors immutable_types config override (locks down spec)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: T\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nbody\n",
      "utf8",
    );
    const created = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "new body\n",
      summary: "x",
      reason: "x",
      provenance: { createdBy: "claude", session: "s" },
    });
    const lockedDown = mergeConfig(defaultConfig(), {
      immutable_types: ["decision", "session", "change", "insight", "spec"],
    });
    await expect(acceptProposal(tmp, lockedDown, created.proposalId)).rejects.toThrow(
      /immutable type 'spec'/,
    );
  });
});

describe("patch proposal — full lifecycle", () => {
  it("create -> list -> accept produces the expected target body and marks proposal accepted", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-007.md"),
      [
        "---",
        "id: SPEC-007",
        "title: Patch demo",
        "status: active",
        "created: 2026-05-01",
        "updated: 2026-05-01",
        "---",
        "## Current Statement",
        "old wording",
        "",
        "## History",
        "- 2026-05-01: created",
        "",
      ].join("\n"),
      "utf8",
    );
    const created = await createProposal(tmp, defaultConfig(), {
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-007",
      patch: [
        {
          kind: "replace-section",
          section: "## Current Statement",
          content: "tightened wording\n",
        },
        {
          kind: "append-section",
          section: "## History",
          content: "- 2026-05-02: tightened wording\n",
        },
      ],
      summary: "tighten + log",
      reason: "user asked",
      provenance: { createdBy: "claude", session: "s" },
    });

    const list = await listProposals(tmp, defaultConfig());
    const p = list.pending.find((x) => x.proposalId === created.proposalId);
    expect(p?.patch).toHaveLength(2);

    const r = await acceptProposal(tmp, defaultConfig(), created.proposalId);
    expect(r.action).toBe("updated");
    const final = readFileSync(r.targetPath, "utf8");
    expect(final).toContain("tightened wording");
    expect(final).not.toContain("old wording");
    expect(final).toContain("- 2026-05-01: created");
    expect(final).toContain("- 2026-05-02: tightened wording");

    const proposalRaw = readFileSync(created.path, "utf8");
    expect(proposalRaw).toContain("status: accepted");
  });
});
