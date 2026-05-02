import { existsSync } from "node:fs";
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
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface SweepOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
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

export async function runSweep(opts: SweepOptions): Promise<SweepResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
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
