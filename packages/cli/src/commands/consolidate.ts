import { existsSync } from "node:fs";
import {
  consolidateRecentSessions,
  type ConsolidateResult,
  defaultConfig,
  loadProjectConfig,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface ConsolidateOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  lookbackDays?: number;
  minMentions?: number;
}

export interface ConsolidateCommandResult {
  exitCode: 0 | 1;
  result?: ConsolidateResult;
  message?: string;
}

export async function runConsolidate(
  opts: ConsolidateOptions,
): Promise<ConsolidateCommandResult> {
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
  const consolidateOpts: Parameters<typeof consolidateRecentSessions>[2] = {};
  if (opts.lookbackDays !== undefined) consolidateOpts.lookbackDays = opts.lookbackDays;
  if (opts.minMentions !== undefined) consolidateOpts.minMentions = opts.minMentions;
  const result = await consolidateRecentSessions(root, cfg, consolidateOpts);
  return { exitCode: 0, result };
}
