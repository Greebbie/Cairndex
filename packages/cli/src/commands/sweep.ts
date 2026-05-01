import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ArchiveProposerResult,
  type ConsolidateResult,
  consolidateRecentSessions,
  defaultConfig,
  loadProjectConfig,
  proposeStaleNodeArchives,
  vaultExists,
  vaultPath,
} from "@cairndex/core";

export interface SweepOptions {
  cwd: string;
  vaultRoot?: string;
  /** Lookback for consolidate (days). */
  lookbackDays?: number;
  /** Min mentions for consolidate. */
  minMentions?: number;
  /** Min age (days) for archive. */
  ageDays?: number;
  /** Confidence threshold for archive. */
  confidenceThreshold?: number;
  /** Override clock (test-only). */
  now?: Date;
}

export interface SweepResult {
  exitCode: 0 | 1;
  message?: string;
  consolidate?: ConsolidateResult;
  archive?: ArchiveProposerResult;
}

function resolveVaultRoot(opts: SweepOptions): string {
  return opts.vaultRoot ? resolve(opts.vaultRoot) : resolve(opts.cwd);
}

export async function runSweep(opts: SweepOptions): Promise<SweepResult> {
  const root = resolveVaultRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
    };
  }
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();

  const consolidateOpts: Parameters<typeof consolidateRecentSessions>[2] = {};
  if (opts.lookbackDays !== undefined) consolidateOpts.lookbackDays = opts.lookbackDays;
  if (opts.minMentions !== undefined) consolidateOpts.minMentions = opts.minMentions;
  const consolidate = await consolidateRecentSessions(root, cfg, consolidateOpts);

  const archiveOpts: Parameters<typeof proposeStaleNodeArchives>[2] = {};
  if (opts.ageDays !== undefined) archiveOpts.ageDays = opts.ageDays;
  if (opts.confidenceThreshold !== undefined) {
    archiveOpts.confidenceThreshold = opts.confidenceThreshold;
  }
  if (opts.now !== undefined) archiveOpts.now = opts.now;
  const archive = await proposeStaleNodeArchives(root, cfg, archiveOpts);

  return { exitCode: 0, consolidate, archive };
}
