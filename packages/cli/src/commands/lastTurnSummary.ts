import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type IntentRecord,
  defaultConfig,
  loadProjectConfig,
  parseTranscriptJsonl,
  readIntent,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface LastTurnSummaryOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Optional path to the Claude Code transcript JSONL. Normally read from stdin payload. */
  transcriptPath?: string;
  /**
   * When true, refuse to write a zero-activity summary unless a real transcript
   * path is present. CLI use sets this by default so manual invocations do not
   * erase the last useful dashboard card.
   */
  requireTranscript?: boolean;
  /**
   * How far back to consider a proposal "new this turn". Defaults to 60 minutes —
   * Stop hooks fire close to write time, but we leave some slack for slow hosts.
   */
  newProposalWindowMs?: number;
  /** Override Date.now() for deterministic tests. */
  now?: number;
  /** Override output file path; defaults to <vault>/state/last-turn-summary.json. */
  outPath?: string;
}

export interface LastTurnSummary {
  ts: string;
  filesTouched: number;
  toolCounts: { Edit: number; Write: number; Bash: number; Read: number };
  newProposals: string[];
  /** Latest session id at the time the summary was written, or null. */
  latestSessionId: string | null;
  /**
   * The pre-flight intent that was active when this turn ended (i.e. captured before
   * the Stop hook chain's `intent clear` step ran). Lets the dashboard's LastTurnCard
   * render "agent said it would do X" alongside the metric line so the user can eyeball
   * whether the actual outcome (filesTouched / toolCounts) matched the contract.
   * Null when no intent was set for this turn.
   */
  intent: IntentRecord | null;
}

export interface LastTurnSummaryResult {
  exitCode: 0 | 1;
  message?: string;
  summary?: LastTurnSummary;
  /** Where the JSON was written. */
  path?: string;
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function recentProposals(vault: string, windowMs: number, now: number): Promise<string[]> {
  const dir = join(vault, "inbox", "proposed-memory-updates");
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const recent: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const m = statSync(join(dir, name)).mtimeMs;
      if (now - m <= windowMs) recent.push(name.replace(/\.md$/, ""));
    } catch {
      // ignore unreadable entries
    }
  }
  return recent.sort();
}

async function latestSessionId(vault: string): Promise<string | null> {
  const dir = join(vault, "sessions");
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  let latestName: string | null = null;
  let latestMtime = 0;
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const m = statSync(join(dir, name)).mtimeMs;
      if (m > latestMtime) {
        latestMtime = m;
        latestName = name.replace(/\.md$/, "");
      }
    } catch {
      // ignore
    }
  }
  return latestName;
}

export async function runLastTurnSummary(
  opts: LastTurnSummaryOptions,
): Promise<LastTurnSummaryResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  // cfg lookup is currently unused but kept for parity with other commands and because
  // future heuristics (e.g. config-driven proposal-folder names) will need it.
  const _cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();
  void _cfg;

  const vault = vaultPath(root);
  const now = opts.now ?? Date.now();
  const windowMs = opts.newProposalWindowMs ?? DEFAULT_WINDOW_MS;

  const hasTranscript = opts.transcriptPath !== undefined && existsSync(opts.transcriptPath);
  if (opts.requireTranscript && !hasTranscript) {
    return {
      exitCode: 1,
      message:
        "last-turn-summary requires a Claude Code Stop-hook transcript payload; pass --allow-empty for manual/debug zero-activity summaries.",
    };
  }

  const transcript = hasTranscript
    ? await parseTranscriptJsonl(opts.transcriptPath as string)
    : { touchedPaths: [], idsReferenced: [], toolCounts: { Edit: 0, Write: 0, Bash: 0, Read: 0 } };

  const newProposals = await recentProposals(vault, windowMs, now);
  const latestSession = await latestSessionId(vault);
  // Capture the intent BEFORE the Stop chain's `intent clear` step removes the file.
  // Order is enforced in `claudeCodeHooks.ts`: last-turn-summary runs at index 2 of the
  // Stop chain, intent clear at index 5. Read failures (missing or malformed) are
  // non-fatal — null is the natural empty-state representation.
  const intent = await readIntent(root).catch(() => null);

  const summary: LastTurnSummary = {
    ts: new Date(now).toISOString(),
    filesTouched: transcript.touchedPaths.length,
    toolCounts: transcript.toolCounts,
    newProposals,
    latestSessionId: latestSession,
    intent,
  };

  const outPath = opts.outPath ?? join(vault, "state", "last-turn-summary.json");
  await mkdir(join(vault, "state"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  return { exitCode: 0, summary, path: outPath };
}
