import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyClaudeHooks } from "@cairndex/core";
import type { FastifyInstance } from "fastify";
import { resolveProject } from "../lib/resolveProject.js";

/**
 * Claude Code wiring helpers — let the GUI install/refresh hooks + MCP server
 * config in the project's `.claude/settings.json` without making the user
 * shell out to `cairndex init`. Closes the "click exe → ready to go" loop.
 *
 * GET  /api/projects/:alias/claude-code-status — what's currently wired
 * POST /api/projects/:alias/claude-code-wire   — refresh hooks + MCP entry
 */

interface ClaudeSettingsShape {
  hooks?: {
    PostToolUse?: unknown[];
    Stop?: unknown[];
    SessionStart?: unknown[];
  };
  mcpServers?: { cairndex?: unknown };
}

interface ClaudeCodeStatus {
  /** True iff `.claude/settings.json` exists AND has at least one cairndex-managed entry. */
  wired: boolean;
  /** Absolute path to the settings.json file (whether or not it exists). */
  settingsPath: string;
  /** True iff the file exists on disk. */
  settingsExists: boolean;
  /** Hook event names that have a cairndex-managed entry. */
  hookEvents: string[];
  /** Whether `mcpServers.cairndex` is set. */
  mcpRegistered: boolean;
}

const CAIRNDEX_HOOK_TAG = "cairndex-managed";

function entryHasCairndexCommand(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as { hooks?: unknown };
  if (!Array.isArray(e.hooks)) return false;
  return e.hooks.some(
    (h): boolean =>
      typeof h === "object" &&
      h !== null &&
      "command" in h &&
      typeof (h as { command: unknown }).command === "string" &&
      (h as { command: string }).command.includes(CAIRNDEX_HOOK_TAG),
  );
}

async function readStatus(repoRoot: string): Promise<ClaudeCodeStatus> {
  const settingsPath = join(repoRoot, ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return {
      wired: false,
      settingsPath,
      settingsExists: false,
      hookEvents: [],
      mcpRegistered: false,
    };
  }
  let parsed: ClaudeSettingsShape = {};
  try {
    parsed = JSON.parse(await readFile(settingsPath, "utf8")) as ClaudeSettingsShape;
  } catch {
    return {
      wired: false,
      settingsPath,
      settingsExists: true,
      hookEvents: [],
      mcpRegistered: false,
    };
  }
  const hookEvents: string[] = [];
  for (const evt of ["PostToolUse", "Stop", "SessionStart"] as const) {
    const list = parsed.hooks?.[evt];
    if (Array.isArray(list) && list.some(entryHasCairndexCommand)) {
      hookEvents.push(evt);
    }
  }
  const mcpRegistered = parsed.mcpServers?.cairndex !== undefined;
  return {
    wired: hookEvents.length > 0 || mcpRegistered,
    settingsPath,
    settingsExists: true,
    hookEvents,
    mcpRegistered,
  };
}

export async function registerClaudeCodeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:alias/claude-code-status", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    // `.claude/settings.json` lives at the repo root. For central-vault projects
    // `project.path` points at the vault project dir, not the repo, so prefer
    // `project.repoRoot` when available. Legacy in-repo projects don't set
    // `repoRoot`; for them `project.path` *is* the repo root.
    return readStatus(project.repoRoot ?? project.path);
  });

  app.post("/api/projects/:alias/claude-code-wire", async (req, reply) => {
    const alias = String((req.params as { alias: string }).alias);
    const project = resolveProject(app.projects, alias);
    if (!project) return reply.code(404).send({ error: "project not found" });
    const repoRoot = project.repoRoot ?? project.path;
    try {
      await applyClaudeHooks(repoRoot);
    } catch (err) {
      app.log.error({ err, alias }, "applyClaudeHooks failed");
      return reply.code(500).send({
        error: "failed to wire Claude Code",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return readStatus(repoRoot);
  });
}
