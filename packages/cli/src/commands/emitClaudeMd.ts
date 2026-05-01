import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  applyCairndexBlock,
  buildActiveContext,
  buildMemoryHealth,
  defaultConfig,
  loadProjectConfig,
  resolveProjectRef,
  renderAgentSurface,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface EmitClaudeMdOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  repoRoot?: string;
  /** Override CLAUDE.md path (absolute or vault-relative). */
  claudeMdPath?: string;
}

export interface EmitClaudeMdResult {
  exitCode: 0 | 1;
  /** Whether the file was created or replaced. */
  action?: "created" | "appended" | "replaced";
  message?: string;
}

export async function runEmitClaudeMd(opts: EmitClaudeMdOptions): Promise<EmitClaudeMdResult> {
  const root = resolveMemoryRoot(opts);

  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
    };
  }

  const cfg = existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();

  const ctx = await buildActiveContext(root, cfg);
  const health = await buildMemoryHealth(root, cfg);
  const body = renderAgentSurface(ctx, health);

  const ref =
    opts.vaultRoot && opts.projectId
      ? resolveProjectRef({ cwd: opts.cwd, vaultRoot: opts.vaultRoot, projectId: opts.projectId })
      : resolveProjectRef({ cwd: opts.cwd });
  const defaultTargetRoot =
    opts.repoRoot ??
    (ref && ref.projectId !== "legacy" && ref.repoRoot ? ref.repoRoot : root);
  const target = opts.claudeMdPath ? resolve(opts.claudeMdPath) : join(defaultTargetRoot, "CLAUDE.md");
  const existing = existsSync(target) ? await readFile(target, "utf8") : undefined;
  const result = applyCairndexBlock(existing, body);
  await writeFile(target, result.updated, "utf8");

  return { exitCode: 0, action: result.action };
}
