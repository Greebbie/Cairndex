import { existsSync } from "node:fs";
import {
  defaultConfig,
  loadProjectConfig,
  repairHandoff,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface HandoffRepairCmdOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  taskId?: string;
  createTaskTitle?: string;
  nextAction?: string;
  dryRun?: boolean;
  json?: boolean;
}

export interface HandoffRepairCmdResult {
  exitCode: 0 | 1;
  message?: string;
  result?: Awaited<ReturnType<typeof repairHandoff>>;
}

function loadCfg(root: string) {
  return existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();
}

function renderResult(result: Awaited<ReturnType<typeof repairHandoff>>): string {
  const lines: string[] = [];
  lines.push(`handoff repair: ${result.before.level} -> ${result.after.level}`);
  lines.push(
    `actions: ${result.applied} applied, ${result.planned} planned, ${result.skipped} skipped, ${result.manual} manual`,
  );
  for (const action of result.actions) {
    lines.push(`  ${action.status.padEnd(7)} ${action.label}: ${action.detail}`);
  }
  lines.push(`after: ${result.after.title} - ${result.after.summary}`);
  return lines.join("\n");
}

export async function runHandoffRepair(
  opts: HandoffRepairCmdOptions,
): Promise<HandoffRepairCmdResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) return { exitCode: 1, message: missingVaultMessage(root) };

  try {
    const result = await repairHandoff(root, loadCfg(root), {
      ...(opts.taskId !== undefined && { taskId: opts.taskId }),
      ...(opts.createTaskTitle !== undefined && { createTaskTitle: opts.createTaskTitle }),
      ...(opts.nextAction !== undefined && { nextAction: opts.nextAction }),
      ...(opts.dryRun !== undefined && { dryRun: opts.dryRun }),
    });
    return {
      exitCode: 0,
      result,
      message: opts.json ? JSON.stringify(result, null, 2) : renderResult(result),
    };
  } catch (err) {
    return { exitCode: 1, message: err instanceof Error ? err.message : String(err) };
  }
}
