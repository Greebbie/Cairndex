import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readProjectPointer } from "@cairndex/core";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

const CAIRNDEX_HOOK_TAG = "cairndex-managed";

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

export function renderClaudeSettings(
  layout: HookLayoutMode,
  repoRoot: string,
): {
  hooks: { PostToolUse: HookEntry[]; Stop: HookEntry[] };
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
      Stop: [
        {
          hooks: [
            { type: "command", command: autoSessionCommand(layout, bin) },
            { type: "command", command: sweepCommand(layout, bin) },
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
      const vaultRoot = pointer.vault.startsWith(".") || !pointer.vault.match(/^[A-Za-z]:|^\//)
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
  for (const evt of ["PostToolUse", "Stop"] as const) {
    const list = (existing.hooks[evt] ?? []) as HookEntry[];
    const filtered = list.filter((h) => !entryIsCairndexManaged(h));
    existing.hooks[evt] = [...filtered, ...desired[evt]];
  }
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
