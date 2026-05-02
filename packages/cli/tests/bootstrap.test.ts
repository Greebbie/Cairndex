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
      `---\nid: PROP-001\nproposalType: create\ntargetType: insight\nstatus: pending\nsummary: ship bootstrap\nreason: hook D wiring\ncontentHash: abc\ncreated: 2026-05-03T00:00:00Z\nprovenance:\n  created_by: test\n  session: t\n---\nbody\n`,
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
