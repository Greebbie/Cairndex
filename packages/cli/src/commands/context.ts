import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  buildContextPack,
  contextPacksPath,
  defaultConfig,
  loadProjectConfig,
  regenerateAllIndexes,
  renderContextPack,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
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
}

export interface ContextResult {
  exitCode: 0 | 1;
  /** Absolute path of the written pack file, when successful. */
  outputPath?: string;
  /** Rendered body — callers may print or pipe. */
  body?: string;
  message?: string;
}

export async function runContext(opts: ContextOptions): Promise<ContextResult> {
  const root = resolveMemoryRoot(opts);

  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
    };
  }

  const cfg = existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();

  // Refresh derived indexes first so the pack reflects the latest vault state. Idempotent —
  // each regenerator skips writing when content is unchanged.
  await regenerateAllIndexes(root, cfg);

  const buildInput: Parameters<typeof buildContextPack>[2] = {};
  if (opts.task !== undefined) buildInput.task = opts.task;
  if (opts.budget !== undefined) buildInput.tokenBudget = opts.budget;
  const pack = await buildContextPack(root, cfg, buildInput);
  const body = renderContextPack(pack);

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
