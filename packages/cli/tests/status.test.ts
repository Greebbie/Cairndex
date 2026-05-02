import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { humanizeRelative, runStatus } from "../src/commands/status.js";

describe("humanizeRelative", () => {
  const NOW = 1_700_000_000_000;
  it("under 30s reads as 'just now'", () => {
    expect(humanizeRelative(NOW - 5_000, NOW)).toBe("just now");
  });
  it("seconds bucket", () => {
    expect(humanizeRelative(NOW - 45_000, NOW)).toBe("45s ago");
  });
  it("minutes bucket", () => {
    expect(humanizeRelative(NOW - 2 * 60_000, NOW)).toBe("2 min ago");
  });
  it("hours bucket", () => {
    expect(humanizeRelative(NOW - 3 * 60 * 60_000, NOW)).toBe("3 hr ago");
  });
  it("days bucket", () => {
    expect(humanizeRelative(NOW - 5 * 24 * 60 * 60_000, NOW)).toBe("5d ago");
  });
});

describe("runStatus", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /**
   * The legacy repo-local layout `.cairndex/` is what `vaultExists` checks for. Build a
   * minimal one with index.md + a node so buildActiveContext + buildMemoryHealth have
   * data to walk.
   */
  function seedLegacyRepo(): string {
    const repo = mkdtempSync(join(tmpdir(), "cairn-status-"));
    dirs.push(repo);
    const vault = join(repo, ".cairndex");
    mkdirSync(join(vault, "specs"), { recursive: true });
    mkdirSync(join(vault, "tasks"), { recursive: true });
    mkdirSync(join(vault, "inbox", "proposed-memory-updates"), { recursive: true });
    writeFileSync(
      join(vault, "index.md"),
      "---\nphase: implementing\nphase_since: 2026-05-01\nnext_action: ship status verb\n---\n# Index\n",
      "utf8",
    );
    writeFileSync(
      join(vault, "specs", "SPEC-001.md"),
      "---\nid: SPEC-001\ntitle: Status verb\nstatus: active\ncreated: 2026-05-01\nupdated: 2026-05-03\n---\nbody\n",
      "utf8",
    );
    return repo;
  }

  it("returns a human report with phase, next action, memory and inbox lines", async () => {
    const repo = seedLegacyRepo();
    const r = await runStatus({ cwd: repo });
    expect(r.exitCode).toBe(0);
    expect(r.body).toBeDefined();
    const text = r.body ?? "";
    expect(text).toContain("Phase:");
    expect(text).toContain("implementing");
    expect(text).toContain("ship status verb");
    expect(text).toContain("Memory:");
    expect(text).toContain("Inbox:");
    expect(text).toContain("Last change:");
    expect(text).toContain("SPEC-001");
  });

  it("--json emits machine-readable structured output", async () => {
    const repo = seedLegacyRepo();
    const r = await runStatus({ cwd: repo, json: true });
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.body ?? "{}") as {
      phase?: string;
      nextAction?: string | null;
      memory?: { red: number; yellow: number; green: number };
      inbox?: { pending: number };
    };
    expect(parsed.phase).toBe("implementing");
    expect(parsed.nextAction).toBe("ship status verb");
    expect(parsed.memory).toBeDefined();
    expect(typeof parsed.memory?.red).toBe("number");
    expect(parsed.inbox?.pending).toBe(0);
  });

  it("missing vault returns exit 1 with a helpful message", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-status-empty-"));
    dirs.push(repo);
    const r = await runStatus({ cwd: repo });
    expect(r.exitCode).toBe(1);
    expect(r.message).toBeDefined();
  });
});
