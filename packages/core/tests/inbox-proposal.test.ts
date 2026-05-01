import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
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
      newFrontmatter: { title: "New spec", status: "active", created: "2026-05-02", updated: "2026-05-02" },
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
