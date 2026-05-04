import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBootstrap } from "../src/commands/bootstrap.js";

describe("runBootstrap", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function seedRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-bootstrap-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "specs"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\nphase_since: 2026-05-01\nnext_action: ship D\n---\n# Index\n",
      "utf8",
    );
    writeFileSync(
      join(vault, "specs", "SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: Bootstrap\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-03\n---\nbody\n",
      "utf8",
    );
    writeFileSync(
      join(vault, "inbox", "proposed-memory-updates", "PROP-001.md"),
      "---\nid: PROP-001\nproposalType: create\ntargetType: insight\nstatus: pending\nsummary: ship bootstrap\nreason: hook D wiring\ncontentHash: abc\ncreated: 2026-05-03T00:00:00Z\nprovenance:\n  created_by: test\n  session: t\n---\nbody\n",
      "utf8",
    );
    return repo;
  }

  it("emits the agent surface and pending proposal lines", async () => {
    const repo = seedRepo();
    const r = await runBootstrap({ cwd: repo });
    expect(r.exitCode).toBe(0);
    const text = r.body ?? "";
    expect(text).toContain("Cairndex session bootstrap");
    expect(text).toContain("Phase: implementing");
    expect(text).toContain("Active spec: SPEC-001");
    expect(text).toContain("PROP-001");
    expect(text).toContain("Pending proposals");
  });

  it("surfaces top memory-health issues inline when yellow+red>0", async () => {
    const repo = seedRepo();
    // Add a node that triggers a freshness yellow (provenance + 90 day-old updated).
    writeFileSync(
      join(repo, ".cairndex", "specs", "SPEC-OLD.md"),
      "---\nid: SPEC-OLD\ntitle: Stale\nstatus: active\ncreated: 2020-01-01\nupdated: 2020-01-01\nprovenance:\n  created_by: test\n  session: legacy\n---\nbody\n",
      "utf8",
    );
    const r = await runBootstrap({ cwd: repo });
    const text = r.body ?? "";
    // Some rule fires on at least one of the SPEC nodes — assert the inline block
    // appears with a severity tag and a node id, not the specific node (the rule
    // ordering may surface SPEC-001's missing-provenance before SPEC-OLD's freshness).
    expect(text).toMatch(/Top issues:/);
    expect(text).toMatch(/(warn|error|info)\s+SPEC-/);
  });

  it("flags a stale latest pack so the agent doesn't trust outdated cached context", async () => {
    const repo = seedRepo();
    const packsDir = join(repo, ".cairndex", "indexes", "context-packs");
    mkdirSync(packsDir, { recursive: true });
    // Pack built before the SPEC was last updated → stale.
    writeFileSync(
      join(packsDir, "PACK-001.md"),
      "---\nid: PACK-001\nbuiltAt: '2026-04-01T00:00:00Z'\n---\nbody\n",
      "utf8",
    );
    // Touch a memory file with a newer mtime than the pack file's mtime so the
    // staleness helper has something to compare against. (The pack frontmatter
    // builtAt drives the comparison; setting mtime here just bypasses the file
    // walker's check on the pack itself, which is excluded by design.)
    const r = await runBootstrap({ cwd: repo });
    expect(r.body).toMatch(/Latest context pack: PACK-001/);
    expect(r.body).toMatch(/STALE — memory changed/);
  });

  it("calls a fresh latest pack 'current' when no memory has changed since builtAt", async () => {
    const repo = seedRepo();
    const packsDir = join(repo, ".cairndex", "indexes", "context-packs");
    mkdirSync(packsDir, { recursive: true });
    // Built far in the future relative to fixture files → not stale.
    writeFileSync(
      join(packsDir, "PACK-001.md"),
      "---\nid: PACK-001\nbuiltAt: '2099-01-01T00:00:00Z'\n---\nbody\n",
      "utf8",
    );
    const r = await runBootstrap({ cwd: repo });
    expect(r.body).toMatch(/Latest context pack: PACK-001/);
    expect(r.body).toMatch(/, current\)/);
    expect(r.body).not.toMatch(/STALE/);
  });

  it("omits the latest-pack line entirely when no packs exist yet", async () => {
    const repo = seedRepo();
    const r = await runBootstrap({ cwd: repo });
    expect(r.body).not.toMatch(/Latest context pack/);
  });

  it("includes CLI command examples in the reminder block (so the agent doesn't have to discover commands)", async () => {
    const repo = seedRepo();
    const r = await runBootstrap({ cwd: repo });
    const text = r.body ?? "";
    expect(text).toMatch(/cairndex inbox propose/);
    expect(text).toMatch(/cairndex inbox propose-update/);
    expect(text).toMatch(/cairndex task switch/);
    expect(text).toMatch(/cairndex task complete/);
    expect(text).toMatch(/cairndex phase set/);
  });

  it("emits an absolute Paths block — Project root, Repo root, Inbox at minimum", async () => {
    const repo = seedRepo();
    const r = await runBootstrap({ cwd: repo });
    const text = r.body ?? "";
    expect(text).toMatch(/Paths:/);
    // Legacy fixture: vaultRoot === projectRoot so the Vault line is suppressed,
    // but Project root, Repo root, and Inbox must all appear with absolute paths.
    expect(text).toMatch(/Project root: .*\.cairndex/);
    expect(text).toContain(`Repo root:    ${repo}`);
    expect(text).toContain("Inbox:");
    expect(text).toMatch(/Inbox:.*proposed-memory-updates/);
  });

  it("says 'no pending proposals' when inbox is empty", async () => {
    const repo = seedRepo();
    rmSync(join(repo, ".cairndex", "inbox", "proposed-memory-updates", "PROP-001.md"));
    const r = await runBootstrap({ cwd: repo });
    expect(r.body).toContain("Inbox: no pending proposals.");
  });

  it("respects --proposal-limit", async () => {
    const repo = seedRepo();
    // add more proposals
    for (let i = 2; i <= 4; i++) {
      writeFileSync(
        join(repo, ".cairndex", "inbox", "proposed-memory-updates", `PROP-00${i}.md`),
        `---\nid: PROP-00${i}\nproposalType: create\ntargetType: insight\nstatus: pending\nsummary: extra ${i}\nreason: r\ncontentHash: ${i}\ncreated: 2026-05-03T00:00:00Z\nprovenance:\n  created_by: test\n  session: t\n---\nbody\n`,
        "utf8",
      );
    }
    const r = await runBootstrap({ cwd: repo, proposalLimit: 2 });
    expect(r.body).toMatch(/showing top 2/);
    // Two of the four should appear; the rest are summarized in the count.
    expect(r.body).toContain("4 total");
  });

  it("missing vault returns exit 1", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-bootstrap-empty-"));
    dirs.push(repo);
    const r = await runBootstrap({ cwd: repo });
    expect(r.exitCode).toBe(1);
    expect(r.message).toBeDefined();
  });
});
