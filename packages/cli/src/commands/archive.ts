import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ArchiveProposerResult,
  defaultConfig,
  loadProjectConfig,
  proposeStaleNodeArchives,
  vaultExists,
  vaultPath,
} from "@cairndex/core";

export interface ArchiveCommandOptions {
  cwd: string;
  vaultRoot?: string;
  ageDays?: number;
  confidenceThreshold?: number;
}

export interface ArchiveCommandResult {
  exitCode: 0 | 1;
  result?: ArchiveProposerResult;
  message?: string;
}

function resolveVaultRoot(opts: ArchiveCommandOptions): string {
  return opts.vaultRoot ? resolve(opts.vaultRoot) : resolve(opts.cwd);
}

export async function runArchive(
  opts: ArchiveCommandOptions,
): Promise<ArchiveCommandResult> {
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
  const archiveOpts: Parameters<typeof proposeStaleNodeArchives>[2] = {};
  if (opts.ageDays !== undefined) archiveOpts.ageDays = opts.ageDays;
  if (opts.confidenceThreshold !== undefined) {
    archiveOpts.confidenceThreshold = opts.confidenceThreshold;
  }
  const result = await proposeStaleNodeArchives(root, cfg, archiveOpts);
  return { exitCode: 0, result };
}
