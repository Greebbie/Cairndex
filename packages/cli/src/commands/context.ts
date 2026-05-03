import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  buildContextPack,
  contextPacksPath,
  defaultConfig,
  findLatestPackWithStaleness,
  loadProjectConfig,
  projectIdFromRoot,
  regenerateAllIndexes,
  renderContextPack,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface ContextOptions {
  /** Working directory (used as default vaultRoot). */
  cwd: string;
  /** Explicit vault path; overrides cwd when set. */
  vaultRoot?: string;
  /** Project id inside a central vault. */
  projectId?: string;
  /** Task label (pure label — does not affect selection). */
  task?: string;
  /** Token budget override. */
  budget?: number;
  /** Override output path (absolute or repo-relative). */
  out?: string;
  /** Print pack body to stdout (default true). */
  emitStdout?: boolean;
  /**
   * When true: only rebuild if the latest pack is stale (memory-mtime newer than
   * pack builtAt) or no pack exists yet. When the existing pack is fresh, skip
   * the rebuild and return its path. Used by the Stop / SessionStart hooks so
   * ending or starting a session doesn't unconditionally pay the rebuild cost.
   */
  ifStale?: boolean;
}

export interface ContextResult {
  exitCode: 0 | 1;
  /** Absolute path of the written pack file, when successful. */
  outputPath?: string;
  /** Rendered body — callers may print or pipe. */
  body?: string;
  message?: string;
  /** True when --if-stale was set and the existing pack was fresh, so no rebuild ran. */
  skippedFresh?: boolean;
}

export async function runContext(opts: ContextOptions): Promise<ContextResult> {
  const root = resolveMemoryRoot(opts);

  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }

  const cfg = existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();

  // --if-stale: bail early when an existing pack is already fresher than memory.
  // Used by the Stop / SessionStart hooks to avoid the rebuild cost on every turn.
  // Only checked here (not at runIndex) because the staleness signal only makes
  // sense relative to a built pack — there's nothing to skip if no pack exists.
  if (opts.ifStale) {
    const latest = await findLatestPackWithStaleness(root);
    if (latest && !latest.stale) {
      return {
        exitCode: 0,
        outputPath: latest.path,
        skippedFresh: true,
      };
    }
  }

  // Refresh derived indexes first so the pack reflects the latest vault state. Idempotent —
  // each regenerator skips writing when content is unchanged.
  await regenerateAllIndexes(root, cfg);

  const buildInput: Parameters<typeof buildContextPack>[2] = {};
  if (opts.task !== undefined) buildInput.task = opts.task;
  if (opts.budget !== undefined) buildInput.tokenBudget = opts.budget;
  const pack = await buildContextPack(root, cfg, buildInput);
  const projectId = opts.projectId ?? projectIdFromRoot(root);
  const body = renderContextPack(pack, projectId);

  const targetDir = contextPacksPath(root);
  const targetPath = opts.out
    ? isAbsolute(opts.out)
      ? opts.out
      : resolve(root, opts.out)
    : `${targetDir}/${pack.packId}.md`;

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, body, "utf8");

  if (opts.emitStdout !== false) {
    process.stdout.write(body);
  }

  return { exitCode: 0, outputPath: targetPath, body };
}
