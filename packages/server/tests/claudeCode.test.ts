import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listVaultProjects } from "@cairndex/core";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";
import { makeCentralVaultFixture } from "./fixtures/centralVault.js";

/**
 * Regression: Codex feedback (2026-05) — the Claude Code Integration panel showed
 * "Not wired" for central-vault projects because the route handed `project.path`
 * (vault project dir) to readStatus/applyClaudeHooks, which expect a repoRoot.
 * These tests pin the fix: the route must read from `project.repoRoot ?? project.path`.
 */
describe("claude-code-status route", () => {
  const fixtures: Array<{ cleanup: () => void }> = [];
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  function writeWiredSettings(repoRoot: string): void {
    mkdirSync(join(repoRoot, ".claude"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".claude", "settings.json"),
      JSON.stringify({ mcpServers: { cairndex: { command: "cairndex", args: ["mcp"] } } }, null, 2),
      "utf8",
    );
  }

  it("central-vault project: status reflects .claude/settings.json at repoRoot, not at vault project root", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-repo-"));
    writeWiredSettings(repoRoot);
    const fx = makeCentralVaultFixture("demo", { repoRoot });
    fixtures.push(fx);

    const projects = await listVaultProjects(fx.vaultRoot);
    expect(projects[0]?.repoRoot).toBe(repoRoot);

    const app = await createServer({ projects, logger: false });
    try {
      const r = await app.inject({
        method: "GET",
        url: "/api/projects/demo/claude-code-status",
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        wired: boolean;
        settingsPath: string;
        settingsExists: boolean;
        mcpRegistered: boolean;
      };
      expect(body.wired).toBe(true);
      expect(body.mcpRegistered).toBe(true);
      expect(body.settingsExists).toBe(true);
      // The settings file the route looked at must be the one under repoRoot,
      // not under the vault project root. The bug surfaced as the latter.
      expect(body.settingsPath).toBe(join(repoRoot, ".claude", "settings.json"));
      expect(body.settingsPath.startsWith(fx.projectRoot)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("central-vault project without a wired settings.json: wired=false but settingsPath still points at repoRoot", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-repo-bare-"));
    const fx = makeCentralVaultFixture("demo", { repoRoot });
    fixtures.push(fx);

    const projects = await listVaultProjects(fx.vaultRoot);
    const app = await createServer({ projects, logger: false });
    try {
      const r = await app.inject({
        method: "GET",
        url: "/api/projects/demo/claude-code-status",
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { wired: boolean; settingsExists: boolean; settingsPath: string };
      expect(body.wired).toBe(false);
      expect(body.settingsExists).toBe(false);
      expect(body.settingsPath).toBe(join(repoRoot, ".claude", "settings.json"));
    } finally {
      await app.close();
    }
  });

  it("legacy project (no repoRoot, project.path is the repo): falls back to project.path", async () => {
    // Legacy in-repo project: no central-vault fixture, just a repo dir with a
    // wired settings.json. The ProjectEntry exposed by the registry has `path`
    // pointing at the repo root and no `repoRoot` field.
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-legacy-"));
    writeWiredSettings(repoRoot);
    const cleanup = (): void => {
      try {
        rmSync(repoRoot, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    };
    fixtures.push({ cleanup });

    const projects = [
      {
        path: repoRoot,
        alias: "legacy",
        registered_at: "",
      },
    ];
    const app = await createServer({ projects, logger: false });
    try {
      const r = await app.inject({
        method: "GET",
        url: "/api/projects/legacy/claude-code-status",
      });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { wired: boolean; settingsPath: string };
      expect(body.wired).toBe(true);
      expect(body.settingsPath).toBe(join(repoRoot, ".claude", "settings.json"));
    } finally {
      await app.close();
    }
  });
});
