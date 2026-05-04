import { existsSync } from "node:fs";
import {
  type ConsolidateResult,
  consolidateRecentSessions,
  defaultConfig,
  loadProjectConfig,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
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

export async function runConsolidate(opts: ConsolidateOptions): Promise<ConsolidateCommandResult> {
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
  const result = await consolidateRecentSessions(root, cfg, consolidateOpts);
  return { exitCode: 0, result };
}
