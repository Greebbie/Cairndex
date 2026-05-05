import { existsSync, statSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type CoverageLevel,
  type ValidationIssue,
  applyAutoFixes,
  defaultConfig,
  generateAutoSession,
  loadProjectConfig,
  migrateNarrativeStatus,
  parseTranscriptJsonl,
  regenerateRecentChanges,
  runValidation,
  scoreAllStoryCoverage,
  signalsPath,
  vaultPath,
} from "@cairndex/core";
import kleur from "kleur";
import { logger, silent as makeSilent } from "../utils/logger.js";
import { readMtimeStore, writeMtimeStore } from "../utils/mtimeStore.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface DoctorOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  silent?: boolean;
  fix?: boolean;
  scope?: "changed" | "all";
  autoSession?: boolean;
  filterPath?: string;
  /**
   * Path to a Claude Code Stop-hook JSONL transcript. When set with --auto-session,
   * the session note is built from real tool-use entries (touched paths, IDs, tool counts)
   * instead of the fallback filesystem mtime walk.
   */
  transcriptPath?: string;
  /**
   * When true, prints story coverage indicators (recent narrative, active task progress,
   * next action defined, inbox hygiene, resume consumption) after the structural health
   * section. Story indicators are informational only — they do NOT affect the exit code.
   */
  story?: boolean;
}

export interface DoctorResult {
  exitCode: 0 | 1;
  issues: ValidationIssue[];
}

function severityColor(sev: ValidationIssue["severity"]): (s: string) => string {
  switch (sev) {
    case "error":
      return kleur.red;
    case "warn":
      return kleur.yellow;
    case "info":
      return kleur.blue;
  }
}

function coverageGlyph(level: CoverageLevel): string {
  switch (level) {
    case "green":
      return kleur.green("●");
    case "yellow":
      return kleur.yellow("●");
    case "red":
      return kleur.red("●");
  }
}

async function collectMtimeTouched(cwd: string): Promise<string[]> {
  const touched: string[] = [];
  const vault = vaultPath(cwd);
  if (!existsSync(vault)) return touched;
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stack = [vault];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory() && e.name !== "archive" && !e.name.startsWith(".")) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        const m = statSync(full).mtimeMs;
        if (m >= cutoff) touched.push(full);
      }
    }
  }
  return touched;
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorResult> {
  if (opts.silent) makeSilent();
  const cwd = resolveMemoryRoot(opts);

  const cfg = existsSync(join(vaultPath(cwd), "config.yaml"))
    ? loadProjectConfig(cwd)
    : defaultConfig();

  let issues = await runValidation(cwd, cfg);

  // --filter-path
  if (opts.filterPath) {
    const prefix = opts.filterPath.replace(/[\\/]+$/, "");
    issues = issues.filter((i) => i.path?.includes(prefix));
  }

  // --scope changed
  if (opts.scope === "changed") {
    const store = await readMtimeStore(cwd);
    issues = issues.filter((i) => {
      if (!i.path || !existsSync(i.path)) return false;
      const m = statSync(i.path).mtimeMs;
      const last = store[i.path];
      return last == null || m > last;
    });
    const fresh: Record<string, number> = {};
    for (const i of issues) {
      if (i.path && existsSync(i.path)) fresh[i.path] = statSync(i.path).mtimeMs;
    }
    await writeMtimeStore(cwd, fresh);
  }

  // --fix
  if (opts.fix) {
    const migResult = await migrateNarrativeStatus({
      cwd,
      vaultRoot: opts.vaultRoot,
      projectId: opts.projectId,
    });
    if (migResult.updated > 0 && !opts.silent) {
      console.log(`migrated ${migResult.updated} sessions: narrative_status backfilled`);
    }

    // Ensure signals/ directory exists (idempotent; silent).
    await mkdir(signalsPath(cwd), { recursive: true });

    const r = await applyAutoFixes(cwd, cfg, issues);
    if (r.fixed.length > 0) {
      logger.info({ count: r.fixed.length }, "auto-fixed issues");
    }
    // Refresh index.md "Recent changes" — idempotent. This makes the PostToolUse hook
    // path equivalent to the watcher path: agents working without the GUI still get
    // a current index between sessions.
    try {
      await regenerateRecentChanges(cwd, cfg);
    } catch {
      // best-effort; never block --fix on index regeneration.
    }
    issues = await runValidation(cwd, cfg);
    if (opts.filterPath) {
      const prefix = opts.filterPath.replace(/[\\/]+$/, "");
      issues = issues.filter((i) => i.path?.includes(prefix));
    }
  }

  // --auto-session also refreshes the index AFTER writing the session note,
  // since the new session is one of the entries that should appear in "Recent changes".
  // (We do this below after generating, to ensure the session file is on disk first.)

  // --auto-session
  if (opts.autoSession) {
    let touchedPaths: string[];
    let toolCounts: { Edit: number; Write: number; Bash: number; Read: number } | undefined;

    if (opts.transcriptPath && existsSync(opts.transcriptPath)) {
      const parsed = await parseTranscriptJsonl(opts.transcriptPath);
      touchedPaths = parsed.touchedPaths;
      toolCounts = parsed.toolCounts;
    } else {
      touchedPaths = await collectMtimeTouched(cwd);
    }

    await generateAutoSession({
      repoRoot: cwd,
      cfg,
      now: new Date(),
      touchedPaths,
      summary: "",
      agentName: "cairndex-auto-session",
      ...(toolCounts ? { toolCounts } : {}),
    });
    // Update index.md "Recent changes" with the new session entry.
    try {
      await regenerateRecentChanges(cwd, cfg);
    } catch {
      // best-effort
    }
  }

  // print issues unless silent
  if (!opts.silent) {
    if (issues.length === 0) {
      console.log(kleur.green("✓ vault is clean"));
    } else {
      const errors = issues.filter((i) => i.severity === "error");
      const warns = issues.filter((i) => i.severity === "warn");
      const infos = issues.filter((i) => i.severity === "info");
      for (const list of [errors, warns, infos]) {
        for (const i of list) {
          const color = severityColor(i.severity);
          const tag = color(i.severity.toUpperCase().padEnd(5));
          console.log(`${tag} ${i.rule}: ${i.message}`);
        }
      }
      console.log();
      console.log(`${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info`);
    }
  }

  // --story: print story coverage indicators after structural health.
  // These are informational only — they do NOT affect the exit code.
  if (opts.story && !opts.silent) {
    const indicators = await scoreAllStoryCoverage({
      cwd,
      ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
      ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    });
    console.log();
    console.log("Story coverage:");
    for (const ind of indicators) {
      const glyph = coverageGlyph(ind.level);
      console.log(`  ${glyph} ${ind.label}: ${ind.detail}`);
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  return { exitCode: hasError ? 1 : 0, issues };
}
