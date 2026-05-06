import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("codex integration routes", () => {
  const fixtures: Array<{ cleanup: () => void }> = [];
  afterEach(() => {
    for (const f of fixtures.splice(0)) f.cleanup();
  });

  function writePointer(repoRoot: string, vaultRoot: string, projectId = "demo"): void {
    writeFileSync(
      join(repoRoot, ".cairndex-project.yaml"),
      `vault: ${JSON.stringify(vaultRoot)}\nproject: ${projectId}\n`,
      "utf8",
    );
  }

  it("status reads Codex hooks and AGENTS.md from the repo root", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-codex-"));
    const fx = makeCentralVaultFixture("demo", { repoRoot });
    fixtures.push(fx);
    writePointer(repoRoot, fx.vaultRoot);
    mkdirSync(join(repoRoot, ".codex"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              { hooks: [{ type: "command", command: "cairndex doctor # cairndex-managed" }] },
            ],
            SessionStart: [
              { hooks: [{ type: "command", command: "cairndex bootstrap # cairndex-managed" }] },
            ],
            Stop: [
              { hooks: [{ type: "command", command: "cairndex context # cairndex-managed" }] },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      join(repoRoot, "AGENTS.md"),
      "<!-- cairndex:start v1 -->\nLast session: none\n<!-- cairndex:end -->\n",
      "utf8",
    );

    const projects = await listVaultProjects(fx.vaultRoot);
    const app = await createServer({ projects, logger: false });
    try {
      const r = await app.inject({ method: "GET", url: "/api/projects/demo/codex-status" });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        wired: boolean;
        hooksPath: string;
        hookEvents: string[];
        agentsBlockPresent: boolean;
      };
      expect(body.wired).toBe(true);
      expect(body.hooksPath).toBe(join(repoRoot, ".codex", "hooks.json"));
      expect(body.hookEvents.sort()).toEqual(["PostToolUse", "SessionStart", "Stop"].sort());
      expect(body.agentsBlockPresent).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("wire creates Codex hooks and AGENTS.md at the repo root for central-vault projects", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "cairn-codex-wire-"));
    const fx = makeCentralVaultFixture("demo", { repoRoot });
    fixtures.push(fx);
    writePointer(repoRoot, fx.vaultRoot);

    const projects = await listVaultProjects(fx.vaultRoot);
    const app = await createServer({ projects, logger: false });
    try {
      const r = await app.inject({ method: "POST", url: "/api/projects/demo/codex-wire" });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        wired: boolean;
        hookEvents: string[];
        agentsBlockPresent: boolean;
      };
      expect(body.wired).toBe(true);
      expect(body.hookEvents.sort()).toEqual(["PostToolUse", "SessionStart", "Stop"].sort());
      expect(body.agentsBlockPresent).toBe(true);

      const hooksPath = join(repoRoot, ".codex", "hooks.json");
      const agentsPath = join(repoRoot, "AGENTS.md");
      expect(existsSync(hooksPath)).toBe(true);
      expect(existsSync(agentsPath)).toBe(true);
      const hooks = JSON.parse(readFileSync(hooksPath, "utf8")) as {
        hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
      };
      const sessionStart =
        hooks.hooks.SessionStart[0]?.hooks.map((h) => h.command).join("\n") ?? "";
      expect(sessionStart).toContain("bootstrap");
      expect(sessionStart).toContain("--vault");
      expect(sessionStart).toContain(fx.vaultRoot);
      expect(sessionStart).toContain("--project");
      expect(sessionStart).toContain("demo");
      expect(readFileSync(agentsPath, "utf8")).toContain("<!-- cairndex:start v1 -->");
    } finally {
      await app.close();
    }
  });
});
