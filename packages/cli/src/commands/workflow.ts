import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  completeTask,
  defaultConfig,
  loadProjectConfig,
  setPhase,
  switchTask,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

/**
 * Workflow-state CLI commands. These mutate canonical files directly (rather than
 * going through the inbox) because they advance project state rather than propose
 * memory content — see `packages/core/src/workflow/taskState.ts` for the rationale.
 *
 * All three commands share the same options (cwd / vault / project) so callers can
 * use them uniformly from the repo cwd, from outside via `--vault`, or against any
 * project in a central vault via `--project`.
 */

export interface WorkflowCmdOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

export interface WorkflowCmdResult {
  exitCode: 0 | 1;
  message?: string;
}

function loadCfg(root: string) {
  return existsSync(join(vaultPath(root), "config.yaml"))
    ? loadProjectConfig(root)
    : defaultConfig();
}

export async function runTaskSwitch(
  opts: WorkflowCmdOptions & { taskId: string },
): Promise<WorkflowCmdResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) return { exitCode: 1, message: missingVaultMessage(root) };
  try {
    const r = await switchTask(root, loadCfg(root), opts.taskId);
    const lines = [r.summary];
    for (const c of r.changed) lines.push(`  ${c.id}: ${c.from || "(new)"} → ${c.to}`);
    return { exitCode: 0, message: lines.join("\n") };
  } catch (err) {
    return { exitCode: 1, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runTaskComplete(
  opts: WorkflowCmdOptions & { taskId?: string },
): Promise<WorkflowCmdResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) return { exitCode: 1, message: missingVaultMessage(root) };
  try {
    const r = await completeTask(root, loadCfg(root), opts.taskId);
    const lines = [r.summary];
    for (const c of r.changed) lines.push(`  ${c.id}: ${c.from || "(new)"} → ${c.to}`);
    return { exitCode: 0, message: lines.join("\n") };
  } catch (err) {
    return { exitCode: 1, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runPhaseSet(
  opts: WorkflowCmdOptions & { phase: string },
): Promise<WorkflowCmdResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) return { exitCode: 1, message: missingVaultMessage(root) };
  try {
    const r = await setPhase(root, opts.phase);
    const fromBit = r.from ? ` (was ${r.from})` : "";
    return {
      exitCode: 0,
      message: `phase → ${r.to}${fromBit}\n  phase_since: ${r.since}`,
    };
  } catch (err) {
    return { exitCode: 1, message: err instanceof Error ? err.message : String(err) };
  }
}
