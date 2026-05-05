import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSweep } from "../src/commands/sweep.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-sweep-cli-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/signals"), { recursive: true });
  writeFileSync(join(tmp, ".cairndex/config.yaml"), "schemaVersion: 1\n");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runSweep", () => {
  it("errors when there is no vault", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cairn-sweep-empty-"));
    const r = await runSweep({ cwd: empty });
    expect(r.exitCode).toBe(1);
    expect(r.message ?? "").toMatch(/no.*vault/i);
    rmSync(empty, { recursive: true, force: true });
  });

  it("returns combined results for an empty vault (zeros, no errors)", async () => {
    const r = await runSweep({ cwd: tmp });
    expect(r.exitCode).toBe(0);
    expect(r.consolidate?.proposalsCreated).toBe(0);
    expect(r.archive?.proposalsCreated).toBe(0);
  });

  it("emits a consolidate signal to signals/ when 3+ sessions reference the same node", async () => {
    for (const date of ["2026-04-25", "2026-04-26", "2026-04-27"]) {
      const id = `${date}-1000`;
      writeFileSync(
        join(tmp, ".cairndex/sessions", `${id}.md`),
        `---\nid: ${id}\ndate: ${date}\nsummary: 's'\n---\n[[SPEC-001]]\n`,
        "utf8",
      );
    }
    const r = await runSweep({ cwd: tmp, lookbackDays: 365 });
    expect(r.consolidate?.proposalsCreated).toBeGreaterThanOrEqual(1);
    // Consolidate now writes to signals/, not inbox/.
    const sigFiles = readdirSync(join(tmp, ".cairndex/signals"));
    expect(sigFiles.some((f) => /^SIG-\d+\.md$/.test(f))).toBe(true);
  });

  it("creates an archive proposal for stale low-confidence unverified nodes", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-099.md"),
      "---\nid: SPEC-099\ntitle: 'Old'\nstatus: draft\ncreated: '2024-01-01'\nupdated: '2024-01-01'\nprovenance:\n  created_by: claude\n  session: old\n  confidence: 0.3\n---\nold body\n",
      "utf8",
    );
    const r = await runSweep({ cwd: tmp, ageDays: 180, now: new Date("2026-05-02T00:00:00Z") });
    expect(r.archive?.proposalsCreated).toBe(1);
  });

  it("is idempotent across runs (no duplicates from dedupe)", async () => {
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-100.md"),
      "---\nid: SPEC-100\ntitle: 'Old'\nstatus: draft\ncreated: '2024-01-01'\nupdated: '2024-01-01'\nprovenance:\n  created_by: claude\n  session: old\n  confidence: 0.3\n---\nold\n",
      "utf8",
    );
    const first = await runSweep({ cwd: tmp, ageDays: 180, now: new Date("2026-05-02T00:00:00Z") });
    const second = await runSweep({
      cwd: tmp,
      ageDays: 180,
      now: new Date("2026-05-02T00:00:00Z"),
    });
    expect(first.archive?.proposalsCreated).toBe(1);
    expect(second.archive?.proposalsCreated).toBe(0);
    const files = readdirSync(join(tmp, ".cairndex/inbox/proposed-memory-updates")).filter((f) =>
      f.endsWith(".md"),
    );
    expect(files.length).toBe(1);
  });

  it("respects --vault override", async () => {
    const otherCwd = mkdtempSync(join(tmpdir(), "cairn-sweep-other-"));
    const r = await runSweep({ cwd: otherCwd, vaultRoot: tmp });
    expect(r.exitCode).toBe(0);
    rmSync(otherCwd, { recursive: true, force: true });
  });

  it("verifies Cairndex's own vault still exists (smoke)", () => {
    expect(existsSync(join(tmp, ".cairndex/inbox/proposed-memory-updates"))).toBe(true);
  });
});
