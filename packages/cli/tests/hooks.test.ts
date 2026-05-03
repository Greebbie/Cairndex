import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyClaudeHooks, renderClaudeSettings, renderMcpServerEntry } from "../src/utils/hooks.js";

describe("renderClaudeSettings", () => {
  it("legacy repo emits --filter-path .cairndex/", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-legacy-"));
    try {
      const json = renderClaudeSettings({ mode: "legacy" }, repo);
      const s = JSON.stringify(json);
      expect(s).toContain("--filter-path .cairndex/");
      expect(s).not.toContain("--vault");
      expect(s).not.toContain("--project ");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("central project emits --vault, --project, and project-relative filter", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-central-"));
    try {
      const json = renderClaudeSettings(
        {
          mode: "central",
          vaultRoot: "C:/Users/me/Vault",
          projectId: "demo",
        },
        repo,
      );
      const s = JSON.stringify(json);
      expect(s).toContain("--vault");
      expect(s).toContain("\\\"C:/Users/me/Vault\\\"");
      expect(s).toContain("--project demo");
      expect(s).toContain("--filter-path projects/demo/");
      expect(s).not.toContain("--filter-path .cairndex/");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("uses bare `cairndex` when the repo has no local CLI bin", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-installed-"));
    try {
      const json = renderClaudeSettings({ mode: "legacy" }, repo);
      const cmd = json.hooks.PostToolUse[0]?.hooks[0]?.command ?? "";
      expect(cmd.startsWith("cairndex ")).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("registers a SessionStart hook running bootstrap and context-if-stale", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-sessionstart-"));
    try {
      const json = renderClaudeSettings({ mode: "legacy" }, repo);
      expect(json.hooks.SessionStart).toBeDefined();
      const start = json.hooks.SessionStart[0]?.hooks ?? [];
      expect(start).toHaveLength(2);
      expect(start[0]?.command).toMatch(/bootstrap/);
      expect(start[0]?.command).toContain("cairndex-managed");
      // Refresh the context pack on session start so any out-of-session edits
      // (web UI accept/reject, manual file edits) are reflected before Claude reads.
      expect(start[1]?.command).toMatch(/context --if-stale/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("Stop chain runs auto-session, auto-distill, last-turn-summary, sweep, then context-if-stale — in that order", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-stop-chain-"));
    try {
      const json = renderClaudeSettings({ mode: "legacy" }, repo);
      const stop = json.hooks.Stop[0]?.hooks ?? [];
      expect(stop).toHaveLength(5);
      expect(stop[0]?.command).toMatch(/auto-session/);
      expect(stop[1]?.command).toMatch(/insight propose-from-session/);
      expect(stop[2]?.command).toMatch(/last-turn-summary/);
      expect(stop[3]?.command).toMatch(/sweep/);
      // Final step: rebuild the context pack if memory changed during the turn,
      // so the next session boots with a fresh pack without the user re-running.
      expect(stop[4]?.command).toMatch(/context --if-stale/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("falls back to `node packages/cli/bin/cairndex` when invoked inside the source repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-render-dev-"));
    try {
      const binDir = join(repo, "packages", "cli", "bin");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "cairndex"), "#!/usr/bin/env node\n", "utf8");

      const json = renderClaudeSettings({ mode: "legacy" }, repo);
      const cmd = json.hooks.PostToolUse[0]?.hooks[0]?.command ?? "";
      expect(cmd.startsWith("node packages/cli/bin/cairndex ")).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("applyClaudeHooks", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("writes legacy hooks when no .cairndex-project.yaml pointer is present", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-legacy-"));
    dirs.push(repo);
    await applyClaudeHooks(repo);
    const settings = readFileSync(join(repo, ".claude", "settings.json"), "utf8");
    expect(settings).toContain("--filter-path .cairndex/");
    expect(settings).not.toContain("--vault");
  });

  it("writes central hooks when a pointer file is present", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-central-"));
    const vault = mkdtempSync(join(tmpdir(), "cairn-hooks-vault-"));
    dirs.push(repo, vault);
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      `vault: "${vault.replace(/\\/g, "/")}"\nproject: demo\n`,
      "utf8",
    );
    await applyClaudeHooks(repo);
    expect(existsSync(join(repo, ".claude", "settings.json"))).toBe(true);
    const settings = readFileSync(join(repo, ".claude", "settings.json"), "utf8");
    expect(settings).toContain("--filter-path projects/demo/");
    expect(settings).toContain("--project demo");
    expect(settings).toContain("--vault");
    expect(settings).not.toContain("--filter-path .cairndex/");
  });

  it("registers the cairndex MCP server alongside hooks", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-mcp-"));
    dirs.push(repo);
    await applyClaudeHooks(repo);
    const settings = JSON.parse(
      readFileSync(join(repo, ".claude", "settings.json"), "utf8"),
    ) as { mcpServers?: Record<string, { command: string; args?: string[] }> };
    expect(settings.mcpServers).toBeDefined();
    expect(settings.mcpServers?.cairndex).toBeDefined();
    expect(settings.mcpServers?.cairndex?.args).toContain("mcp");
  });

  it("MCP entry passes --vault and --project for central layouts", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-mcp-central-"));
    const vault = mkdtempSync(join(tmpdir(), "cairn-hooks-mcp-vault-"));
    dirs.push(repo, vault);
    writeFileSync(
      join(repo, ".cairndex-project.yaml"),
      `vault: "${vault.replace(/\\/g, "/")}"\nproject: demo\n`,
      "utf8",
    );
    await applyClaudeHooks(repo);
    const settings = JSON.parse(
      readFileSync(join(repo, ".claude", "settings.json"), "utf8"),
    ) as { mcpServers?: Record<string, { command: string; args?: string[] }> };
    const args = settings.mcpServers?.cairndex?.args ?? [];
    expect(args).toContain("--vault");
    expect(args).toContain("--project");
    expect(args).toContain("demo");
  });

  it("preserves user-defined mcpServers entries while overwriting cairndex idempotently", async () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-hooks-mcp-preserve-"));
    dirs.push(repo);
    mkdirSync(join(repo, ".claude"), { recursive: true });
    writeFileSync(
      join(repo, ".claude", "settings.json"),
      JSON.stringify({
        mcpServers: {
          other: { command: "node", args: ["other.js"] },
          cairndex: { command: "stale", args: ["stale"] },
        },
      }),
      "utf8",
    );
    await applyClaudeHooks(repo);
    const settings = JSON.parse(
      readFileSync(join(repo, ".claude", "settings.json"), "utf8"),
    ) as { mcpServers?: Record<string, { command: string; args?: string[] }> };
    expect(settings.mcpServers?.other?.command).toBe("node");
    expect(settings.mcpServers?.cairndex?.command).not.toBe("stale");
    expect(settings.mcpServers?.cairndex?.args).toContain("mcp");
  });
});

describe("renderMcpServerEntry", () => {
  it("legacy layout produces minimal args", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-mcp-legacy-"));
    try {
      const entry = renderMcpServerEntry({ mode: "legacy" }, repo);
      expect(entry.command).toBe("cairndex");
      expect(entry.args).toEqual(["mcp"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("central layout includes vault and project arguments", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-mcp-central-"));
    try {
      const entry = renderMcpServerEntry(
        { mode: "central", vaultRoot: "/v", projectId: "p" },
        repo,
      );
      expect(entry.args).toEqual(["mcp", "--vault", "/v", "--project", "p"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("uses node + repo-relative bin when invoked inside the source repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "cairn-mcp-dev-"));
    try {
      const binDir = join(repo, "packages", "cli", "bin");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "cairndex"), "#!/usr/bin/env node\n", "utf8");
      const entry = renderMcpServerEntry({ mode: "legacy" }, repo);
      expect(entry.command).toBe("node");
      expect(entry.args?.[0]).toBe("packages/cli/bin/cairndex");
      expect(entry.args).toContain("mcp");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
