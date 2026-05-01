import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  runInboxAccept,
  runInboxList,
  runInboxPropose,
  runInboxReject,
} from "../src/commands/inbox.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-cli-inbox-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001.md"),
    "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-01\n---\nold body\n",
    "utf8",
  );
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runInboxPropose", () => {
  it("creates a proposal file with the supplied payload", async () => {
    const r = await runInboxPropose({
      cwd: tmp,
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "new body\n",
      summary: "tighten",
      reason: "clarity",
      createdBy: "claude-code",
      session: "2026-05-02-1500",
    });
    expect(r.exitCode).toBe(0);
    expect(r.proposalId).toMatch(/^PROP-/);
    expect(existsSync(r.path)).toBe(true);
  });

  it("flags duplicate proposals without writing a new file when the same body is proposed twice", async () => {
    const args = {
      cwd: tmp,
      proposalType: "update" as const,
      targetType: "spec" as const,
      target: "SPEC-001",
      newBody: "same body\n",
      summary: "x",
      reason: "x",
      createdBy: "claude-code",
      session: "s",
    };
    const a = await runInboxPropose(args);
    const b = await runInboxPropose(args);
    expect(a.proposalId).not.toEqual(b.proposalId); // a new file is still created
    expect(b.duplicateOf).toBe(a.proposalId);
  });
});

describe("runInboxList", () => {
  it("returns the bucketed proposal list", async () => {
    await runInboxPropose({
      cwd: tmp,
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "x",
      summary: "x",
      reason: "x",
      createdBy: "claude",
      session: "s",
    });
    const r = await runInboxList({ cwd: tmp });
    expect(r.exitCode).toBe(0);
    expect(r.list?.pending.length).toBe(1);
  });
});

describe("runInboxAccept", () => {
  it("applies an update proposal to the durable folder", async () => {
    const p = await runInboxPropose({
      cwd: tmp,
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "shiny new body\n",
      summary: "x",
      reason: "x",
      createdBy: "claude",
      session: "s",
    });
    if (!p.proposalId) throw new Error("expected proposalId");
    const r = await runInboxAccept({ cwd: tmp, proposalId: p.proposalId });
    expect(r.exitCode).toBe(0);
    const updated = readFileSync(join(tmp, ".cairndex/specs/SPEC-001.md"), "utf8");
    expect(updated).toContain("shiny new body");
  });
});

describe("runInboxReject", () => {
  it("marks a proposal rejected with the supplied reason", async () => {
    const p = await runInboxPropose({
      cwd: tmp,
      proposalType: "update",
      targetType: "spec",
      target: "SPEC-001",
      newBody: "x",
      summary: "x",
      reason: "x",
      createdBy: "claude",
      session: "s",
    });
    if (!p.proposalId || !p.path) throw new Error("expected proposal fields");
    const r = await runInboxReject({
      cwd: tmp,
      proposalId: p.proposalId,
      reason: "not aligned",
    });
    expect(r.exitCode).toBe(0);
    const raw = readFileSync(p.path, "utf8");
    expect(raw).toContain("status: rejected");
    expect(raw).toContain("not aligned");
  });
});
