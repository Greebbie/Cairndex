import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
// Inside @cairndex/core itself, import from the local module rather than the
// package barrel — avoids a self-referential workspace cycle during build.
import { readProjectPointer } from "./projectRef.js";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    SessionStart?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  mcpServers?: Record<string, McpServerEntry>;
  [k: string]: unknown;
}

const CAIRNDEX_HOOK_TAG = "cairndex-managed";
const CAIRNDEX_MCP_KEY = "cairndex";

export type HookLayoutMode =
  | { mode: "legacy" }
  | { mode: "central"; vaultRoot: string; projectId: string };

function shellQuote(p: string): string {
  // Cross-platform safe path quoting for Claude Code's shell. Wrap in double quotes
  // and escape any embedded double quote.
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * Resolve the binary invocation. When this repo IS the cairndex source repo,
 * a global `cairndex` may not be on PATH inside Claude Code's hook subshell —
 * so we fall back to `node packages/cli/bin/cairndex` (resolved relative to
 * the repo root, which is hooks' cwd). Consumers who installed cairndex
 * globally use the bare command.
 */
function resolveBinCommand(repoRoot: string): string {
  const localBin = join(repoRoot, "packages", "cli", "bin", "cairndex");
  if (existsSync(localBin)) return "node packages/cli/bin/cairndex";
  return "cairndex";
}

function doctorCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} doctor --silent --fix --scope changed ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `--filter-path projects/${layout.projectId}/ ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} doctor --silent --fix --scope changed --filter-path .cairndex/ # ${CAIRNDEX_HOOK_TAG}`;
}

function autoSessionCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} doctor --silent --auto-session ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} doctor --silent --auto-session # ${CAIRNDEX_HOOK_TAG}`;
}

function sweepCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} sweep --silent ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} sweep --silent # ${CAIRNDEX_HOOK_TAG}`;
}

function lastTurnSummaryCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} last-turn-summary ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} last-turn-summary # ${CAIRNDEX_HOOK_TAG}`;
}

function bootstrapCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} bootstrap ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} bootstrap # ${CAIRNDEX_HOOK_TAG}`;
}

function autoDistillCommand(layout: HookLayoutMode, bin: string): string {
  // Runs without a positional sessionId so it auto-picks the just-written session by mtime.
  if (layout.mode === "central") {
    return (
      `${bin} insight propose-from-session --silent ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} insight propose-from-session --silent # ${CAIRNDEX_HOOK_TAG}`;
}

/**
 * Refresh the context pack, but only if memory has changed since the last build.
 * Append to the Stop chain (so the next session inherits a fresh pack) and to the
 * SessionStart chain (so any between-session edits are picked up before Claude reads
 * anything). Cheap when nothing changed — just a stat + frontmatter scan.
 */
function contextIfStaleCommand(layout: HookLayoutMode, bin: string): string {
  if (layout.mode === "central") {
    return (
      `${bin} context --if-stale --silent --no-stdout ` +
      `--vault ${shellQuote(layout.vaultRoot)} ` +
      `--project ${layout.projectId} ` +
      `# ${CAIRNDEX_HOOK_TAG}`
    );
  }
  return `${bin} context --if-stale --silent --no-stdout # ${CAIRNDEX_HOOK_TAG}`;
}

/**
 * Build the MCP server entry that Claude Code will spawn over stdio.
 *
 * Resolution mirrors resolveBinCommand: when running inside the cairndex source repo we
 * prefer `node packages/cli/bin/cairndex mcp` so the agent uses the local checkout;
 * otherwise we use the bare `cairndex mcp` command which assumes a global install.
 *
 * For central-vault layouts we explicitly pass --vault and --project so the MCP server
 * binds to the correct project regardless of which cwd Claude Code spawns the process in.
 */
export function renderMcpServerEntry(layout: HookLayoutMode, repoRoot: string): McpServerEntry {
  const localBin = join(repoRoot, "packages", "cli", "bin", "cairndex");
  const useLocal = existsSync(localBin);
  const command = useLocal ? "node" : "cairndex";
  const baseArgs = useLocal ? ["packages/cli/bin/cairndex", "mcp"] : ["mcp"];
  if (layout.mode === "central") {
    return {
      command,
      args: [...baseArgs, "--vault", layout.vaultRoot, "--project", layout.projectId],
    };
  }
  return { command, args: baseArgs };
}

export function renderClaudeSettings(
  layout: HookLayoutMode,
  repoRoot: string,
): {
  hooks: { PostToolUse: HookEntry[]; Stop: HookEntry[]; SessionStart: HookEntry[] };
} {
  const bin = resolveBinCommand(repoRoot);
  return {
    hooks: {
      PostToolUse: [
        {
          matcher: "Write|Edit",
          hooks: [{ type: "command", command: doctorCommand(layout, bin) }],
        },
      ],
      // Stop chain order: write the session note (auto-session reads transcript), distill
      // a draft insight from it (heuristic, no LLM), summarize the turn into state JSON
      // for the GUI, sweep (consolidate + archive), and finally rebuild the context pack
      // if memory changed during the turn — so the next session boots with a fresh pack.
      // Each step is independent and silent on success; failure of any one step does not
      // block the rest.
      Stop: [
        {
          hooks: [
            { type: "command", command: autoSessionCommand(layout, bin) },
            { type: "command", command: autoDistillCommand(layout, bin) },
            { type: "command", command: lastTurnSummaryCommand(layout, bin) },
            { type: "command", command: sweepCommand(layout, bin) },
            { type: "command", command: contextIfStaleCommand(layout, bin) },
          ],
        },
      ],
      // SessionStart prints the bootstrap block to stdout, then refreshes the context pack
      // if any out-of-session edits invalidated it. Claude Code captures bootstrap stdout
      // into the agent's first-turn input, so the agent sees phase + active task + pending
      // proposals immediately, and any subsequent context_pack MCP read returns a current
      // pack instead of a stale one.
      SessionStart: [
        {
          hooks: [
            { type: "command", command: bootstrapCommand(layout, bin) },
            { type: "command", command: contextIfStaleCommand(layout, bin) },
          ],
        },
      ],
    },
  };
}

function entryIsCairndexManaged(entry: unknown): boolean {
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

function detectLayout(repoRoot: string): HookLayoutMode {
  try {
    const pointer = readProjectPointer(repoRoot);
    if (pointer) {
      const vaultRoot =
        pointer.vault.startsWith(".") || !pointer.vault.match(/^[A-Za-z]:|^\//)
          ? join(repoRoot, pointer.vault)
          : pointer.vault;
      return { mode: "central", vaultRoot, projectId: pointer.project };
    }
  } catch {
    // pointer unreadable — fall through to legacy
  }
  return { mode: "legacy" };
}

export async function applyClaudeHooks(repoRoot: string): Promise<void> {
  const path = join(repoRoot, ".claude", "settings.json");
  let existing: ClaudeSettings = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
    } catch {
      existing = {};
    }
  }
  existing.hooks = existing.hooks ?? {};
  const layout = detectLayout(repoRoot);
  const desired = renderClaudeSettings(layout, repoRoot).hooks;
  for (const evt of ["PostToolUse", "Stop", "SessionStart"] as const) {
    const list = (existing.hooks[evt] ?? []) as HookEntry[];
    const filtered = list.filter((h) => !entryIsCairndexManaged(h));
    existing.hooks[evt] = [...filtered, ...desired[evt]];
  }
  // MCP server registration. mcpServers is keyed by name, so simply overwriting the
  // `cairndex` key is idempotent — re-running init refreshes paths/vault args without
  // disturbing other servers. Other entries are preserved untouched.
  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers[CAIRNDEX_MCP_KEY] = renderMcpServerEntry(layout, repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
