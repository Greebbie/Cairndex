import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

/**
 * Phase G regression: when a `.cairndex-project.yaml` pointer exists, `cairndex init`
 * should treat the repo as already on the central layout and refresh hooks only —
 * NOT re-create a legacy `.cairndex/` skeleton next to the pointer.
 *
 * The earlier test suite covers `applyClaudeHooks` and the legacy init path; this
 * file specifically pins the central-mode short-circuit so a future refactor can't
 * silently regress it.
 */

describe("runInit (central-pointer layout)", () => {
  const dirs: string[] = [];
  let prevHome: string | undefined;

  // Isolate the global registry to a per-test temp dir so test runs don't pollute
  // the developer's `~/.cairndex/projects.json`. runInit calls registerProject
  // which writes to the registry; without isolation, every test run leaves
  // behind `cairn-init-central-*` aliases in the user's sidebar.
  // Mirrors the pattern in central-vault-e2e.test.ts.
  beforeEach(() => {
    const isolatedHome = mkdtempSync(join(tmpdir(), "cairn-init-test-home-"));
    dirs.push(isolatedHome);
    prevHome = process.env.CAIRNDEX_HOME;
    process.env.CAIRNDEX_HOME = isolatedHome;
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    if (prevHome === undefined) Reflect.deleteProperty(process.env, "CAIRNDEX_HOME");
    else process.env.CAIRNDEX_HOME = prevHome;
  });

  function fakeRepoWithPointer(): { repo: string; vault: string } {
    const repo = mkdtempSync(join(tmpdir(), "cairn-init-central-"));
    const vault = mkdtempSync(join(tmpdir(), "cairn-init-vault-"));
    dirs.push(repo, vault);
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      `vault: "${vault.replace(/\\/g, "/")}"\nproject: demo\n`,
      "utf8",
    );
    return { repo, vault };
  }

  it("does NOT create a legacy .cairndex/ folder when a central pointer exists", async () => {
    const { repo } = fakeRepoWithPointer();
    await runInit({
      cwd: repo,
      yes: true,
      claudeMd: false,
      hooks: false,
    });
    expect(existsSync(join(repo, ".cairndex"))).toBe(false);
  });

  it("does still write Claude Code hooks (the actual goal of init for central repos)", async () => {
    const { repo } = fakeRepoWithPointer();
    await runInit({
      cwd: repo,
      yes: true,
      claudeMd: false,
      hooks: true,
    });
    const settingsPath = join(repo, ".claude", "settings.json");
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(require("node:fs").readFileSync(settingsPath, "utf8")) as {
      hooks?: { SessionStart?: unknown; Stop?: unknown };
      mcpServers?: { cairndex?: unknown };
    };
    expect(settings.hooks?.SessionStart).toBeDefined();
    expect(settings.hooks?.Stop).toBeDefined();
    expect(settings.mcpServers?.cairndex).toBeDefined();
  });

  it("legacy fallback still works on a fresh repo with no pointer", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-init-legacy-"));
    dirs.push(repo);
    await runInit({
      cwd: repo,
      yes: true,
      claudeMd: false,
      hooks: false,
    });
    expect(existsSync(join(repo, ".cairndex"))).toBe(true);
    const subdirs = readdirSync(join(repo, ".cairndex"));
    // The skeleton ships at minimum these durable-node folders.
    for (const expected of ["specs", "decisions", "plans", "tasks", "sessions"]) {
      expect(subdirs).toContain(expected);
    }
  });

  it("does NOT write a sync baseline when in central mode (no legacy folder to track)", async () => {
    const { repo } = fakeRepoWithPointer();
    await runInit({
      cwd: repo,
      yes: true,
      claudeMd: false,
      hooks: false,
    });
    // The legacy code unconditionally wrote `.cairndex/.sync-baseline.json`. Central
    // mode skips it because there's no legacy folder to baseline against.
    expect(existsSync(join(repo, ".cairndex", ".sync-baseline.json"))).toBe(false);
  });
});

/**
 * Avoid mkdirSync-only lint by referencing it once — keep the import list realistic
 * for future expansions of this suite.
 */
mkdirSync;
