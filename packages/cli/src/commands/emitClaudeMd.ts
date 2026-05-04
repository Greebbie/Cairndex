import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  applyCairndexBlock,
  buildActiveContext,
  buildMemoryHealth,
  defaultConfig,
  loadProjectConfig,
  projectIdFromRoot,
  renderAgentSurface,
  resolveProjectRef,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
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
      message: missingVaultMessage(root),
    };
  }

  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();

  const ctx = await buildActiveContext(root, cfg);
  const health = await buildMemoryHealth(root, cfg);
  const projectId = opts.projectId ?? projectIdFromRoot(root);
  const body = renderAgentSurface(ctx, health, projectId);

  // If the caller passed --vault explicitly, don't fall back to cwd-based pointer
  // discovery for the target — explicit args always win, otherwise a stray
  // .cairndex-project.yaml in the cwd silently overrides the user's choice.
  const ref = opts.vaultRoot
    ? opts.projectId
      ? resolveProjectRef({ cwd: opts.cwd, vaultRoot: opts.vaultRoot, projectId: opts.projectId })
      : null
    : resolveProjectRef({ cwd: opts.cwd });
  const defaultTargetRoot =
    opts.repoRoot ?? (ref && ref.projectId !== "legacy" && ref.repoRoot ? ref.repoRoot : root);
  const target = opts.claudeMdPath
    ? resolve(opts.claudeMdPath)
    : join(defaultTargetRoot, "CLAUDE.md");
  const existing = existsSync(target) ? await readFile(target, "utf8") : undefined;
  const result = applyCairndexBlock(existing, body);
  await writeFile(target, result.updated, "utf8");

  return { exitCode: 0, action: result.action };
}
