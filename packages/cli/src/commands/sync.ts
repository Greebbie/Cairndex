import { runSync, sharedDir } from "@cairndex/core";
import kleur from "kleur";
import { logger, silent as makeSilent } from "../utils/logger.js";

export interface SyncCmdOptions {
  cwd: string;
  silent?: boolean;
}

export interface SyncCmdResult {
  exitCode: 0 | 1;
}

export async function runSyncCmd(opts: SyncCmdOptions): Promise<SyncCmdResult> {
  if (opts.silent) makeSilent();
  const r = await runSync({ globalDir: sharedDir(), projectDir: opts.cwd });

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
