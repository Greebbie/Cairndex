import { existsSync } from "node:fs";
import {
  type ArchiveProposerResult,
  defaultConfig,
  loadProjectConfig,
  proposeStaleNodeArchives,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface ArchiveCommandOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  ageDays?: number;
  confidenceThreshold?: number;
}

export interface ArchiveCommandResult {
  exitCode: 0 | 1;
  result?: ArchiveProposerResult;
  message?: string;
}

export async function runArchive(
  opts: ArchiveCommandOptions,
): Promise<ArchiveCommandResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
    };
  }
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();
  const archiveOpts: Parameters<typeof proposeStaleNodeArchives>[2] = {};
  if (opts.ageDays !== undefined) archiveOpts.ageDays = opts.ageDays;
  if (opts.confidenceThreshold !== undefined) {
    archiveOpts.confidenceThreshold = opts.confidenceThreshold;
  }
  const result = await proposeStaleNodeArchives(root, cfg, archiveOpts);
  return { exitCode: 0, result };
}
