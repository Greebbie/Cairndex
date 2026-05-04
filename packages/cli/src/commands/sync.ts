import { centralSharedPath, resolveProjectRef, runSync, sharedDir } from "@cairndex/core";
import kleur from "kleur";
import { logger, silent as makeSilent } from "../utils/logger.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface SyncCmdOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  silent?: boolean;
}

export interface SyncCmdResult {
  exitCode: 0 | 1;
}

export async function runSyncCmd(opts: SyncCmdOptions): Promise<SyncCmdResult> {
  if (opts.silent) makeSilent();
  const projectDir = resolveMemoryRoot(opts);
  const ref =
    opts.vaultRoot && opts.projectId
      ? resolveProjectRef({ cwd: opts.cwd, vaultRoot: opts.vaultRoot, projectId: opts.projectId })
      : opts.vaultRoot
        ? null
        : resolveProjectRef({ cwd: opts.cwd });
  const sourceShared =
    ref && ref.projectId !== "legacy" ? centralSharedPath(ref.vaultRoot) : sharedDir();
  const r = await runSync({ globalDir: sourceShared, projectDir });

  if (!opts.silent) {
    console.log(`${kleur.green("✓")} fast-forwarded: ${r.fastForwarded.length}`);
    for (const f of r.fastForwarded) console.log(`  ${f}`);
    console.log(`${kleur.yellow("•")} kept local edits: ${r.skippedLocalEdits.length}`);
    for (const f of r.skippedLocalEdits) console.log(`  ${f}`);
    console.log(`${kleur.red("⚠")} conflicts: ${r.conflicts.length}`);
    for (const f of r.conflicts) console.log(`  ${f} → see .cairndex/.sync-conflicts/`);
  }

  void logger;
  return { exitCode: r.conflicts.length > 0 ? 1 : 0 };
}
