import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { applyCairndexBlock } from "./claudeMd.js";
import { loadProjectConfig } from "./config.js";
import { buildMemoryHealth } from "./indexes/memoryHealth.js";
import { vaultPath } from "./paths.js";
import { readProjectPointer } from "./projectRef.js";
import { buildResumeView } from "./resume/buildResumeView.js";
import { renderAgentFlavor } from "./resume/renderers.js";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface CodexHooks {
  hooks?: {
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    SessionStart?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

export interface CodexStatus {
  wired: boolean;
  hooksPath: string;
  hooksExists: boolean;
  hookEvents: string[];
  agentsMdPath: string;
  agentsMdExists: boolean;
  agentsBlockPresent: boolean;
}

type HookLayoutMode =
  | { mode: "legacy" }
  | { mode: "central"; vaultRoot: string; projectId: string };

const CAIRNDEX_HOOK_TAG = "cairndex-managed";
const EXPECTED_EVENTS = ["PostToolUse", "SessionStart", "Stop"] as const;

function shellQuote(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

function resolveBinCommand(repoRoot: string): string {
  const localBin = join(repoRoot, "packages", "cli", "bin", "cairndex");
  if (existsSync(localBin)) return "node packages/cli/bin/cairndex";
  return "cairndex";
}

function detectLayout(repoRoot: string): HookLayoutMode {
  try {
    const pointer = readProjectPointer(repoRoot);
    if (pointer) {
      const vaultRoot = isAbsolute(pointer.vault)
        ? resolve(pointer.vault)
        : resolve(repoRoot, pointer.vault);
      return { mode: "central", vaultRoot, projectId: pointer.project };
    }
  } catch {
    // Unreadable pointer falls back to legacy mode.
  }
  return { mode: "legacy" };
}

function withProjectArgs(layout: HookLayoutMode): string {
  if (layout.mode === "legacy") return "";
  return ` --vault ${shellQuote(layout.vaultRoot)} --project ${layout.projectId}`;
}

function doctorCommand(layout: HookLayoutMode, bin: string): string {
  const scope =
    layout.mode === "central"
      ? ` --filter-path projects/${layout.projectId}/`
      : " --filter-path .cairndex/";
  return `${bin} doctor --silent --fix --scope changed${withProjectArgs(layout)}${scope} # ${CAIRNDEX_HOOK_TAG}`;
}

function autoSessionCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} doctor --silent --auto-session${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function autoDistillCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} insight propose-from-session --silent${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function lastTurnSummaryCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} last-turn-summary${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function sweepCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} sweep --silent${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function contextIfStaleCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} context --if-stale --silent --no-stdout${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function intentClearCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} intent clear --silent${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function bootstrapCommand(layout: HookLayoutMode, bin: string): string {
  return `${bin} bootstrap${withProjectArgs(layout)} # ${CAIRNDEX_HOOK_TAG}`;
}

function renderCodexHooks(
  layout: HookLayoutMode,
  repoRoot: string,
): Required<Pick<CodexHooks, "hooks">> {
  const bin = resolveBinCommand(repoRoot);
  return {
    hooks: {
      PostToolUse: [
        {
          matcher: "Write|Edit",
          hooks: [{ type: "command", command: doctorCommand(layout, bin) }],
        },
      ],
      SessionStart: [
        {
          hooks: [
            { type: "command", command: bootstrapCommand(layout, bin) },
            { type: "command", command: contextIfStaleCommand(layout, bin) },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            { type: "command", command: autoSessionCommand(layout, bin) },
            { type: "command", command: autoDistillCommand(layout, bin) },
            { type: "command", command: lastTurnSummaryCommand(layout, bin) },
            { type: "command", command: sweepCommand(layout, bin) },
            { type: "command", command: contextIfStaleCommand(layout, bin) },
            { type: "command", command: intentClearCommand(layout, bin) },
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

function eventHasCairndexEntry(entries: unknown): boolean {
  return Array.isArray(entries) && entries.some(entryIsCairndexManaged);
}

function hasCairndexBlock(raw: string | undefined): boolean {
  return (
    !!raw && raw.includes("<!-- cairndex:start v1 -->") && raw.includes("<!-- cairndex:end -->")
  );
}

export async function readCodexStatus(repoRoot: string): Promise<CodexStatus> {
  const hooksPath = join(repoRoot, ".codex", "hooks.json");
  const agentsMdPath = join(repoRoot, "AGENTS.md");
  let parsed: CodexHooks = {};
  const hooksExists = existsSync(hooksPath);
  if (hooksExists) {
    try {
      parsed = JSON.parse(await readFile(hooksPath, "utf8")) as CodexHooks;
    } catch {
      parsed = {};
    }
  }
  const hookEvents = EXPECTED_EVENTS.filter((evt) => eventHasCairndexEntry(parsed.hooks?.[evt]));
  const agentsRaw = existsSync(agentsMdPath) ? await readFile(agentsMdPath, "utf8") : undefined;
  const agentsBlockPresent = hasCairndexBlock(agentsRaw);
  return {
    wired: hookEvents.length > 0 || agentsBlockPresent,
    hooksPath,
    hooksExists,
    hookEvents,
    agentsMdPath,
    agentsMdExists: agentsRaw !== undefined,
    agentsBlockPresent,
  };
}

export async function applyCodexHooks(repoRoot: string): Promise<CodexStatus> {
  const layout = detectLayout(repoRoot);
  const hooksPath = join(repoRoot, ".codex", "hooks.json");
  let existing: CodexHooks = {};
  if (existsSync(hooksPath)) {
    try {
      existing = JSON.parse(await readFile(hooksPath, "utf8")) as CodexHooks;
    } catch {
      existing = {};
    }
  }
  existing.hooks = existing.hooks ?? {};
  const desired = renderCodexHooks(layout, repoRoot).hooks;
  for (const evt of EXPECTED_EVENTS) {
    const list = existing.hooks[evt] ?? [];
    const desiredForEvent = desired[evt] ?? [];
    existing.hooks[evt] = [...list.filter((h) => !entryIsCairndexManaged(h)), ...desiredForEvent];
  }
  mkdirSync(dirname(hooksPath), { recursive: true });
  await writeFile(hooksPath, JSON.stringify(existing, null, 2), "utf8");

  const view = await buildResumeView({ cwd: repoRoot });
  const cfg = loadProjectConfig(repoRoot);
  const health = await buildMemoryHealth(repoRoot, cfg);
  const body = renderAgentFlavor(view, { health });
  const agentsMdPath = join(repoRoot, "AGENTS.md");
  const existingAgents = existsSync(agentsMdPath)
    ? await readFile(agentsMdPath, "utf8")
    : undefined;
  const result = applyCairndexBlock(existingAgents, body);
  await writeFile(agentsMdPath, result.updated, "utf8");

  // Touch vaultPath(repoRoot) via the public resolver as a cheap assertion that
  // pointer resolution stays valid for central-vault projects.
  vaultPath(repoRoot);
  return readCodexStatus(repoRoot);
}
