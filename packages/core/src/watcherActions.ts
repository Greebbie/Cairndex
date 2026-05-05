import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { archiveIfNeeded } from "./archive.js";
import { applyCairndexBlock } from "./claudeMd.js";
import type { Config } from "./config.js";
import { loadProjectConfig } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { buildMemoryHealth } from "./indexes/memoryHealth.js";
import { regenerateAllIndexes } from "./indexes/regenerate.js";
import { normalizeFrontmatter } from "./normalize.js";
import { INDEXES_DIR, vaultPath } from "./paths.js";
import { buildResumeView } from "./resume/buildResumeView.js";
import { renderAgentFlavor } from "./resume/renderers.js";
import { writeResumeCache } from "./resume/cache.js";
import { applyAutoFixes } from "./validate/fix.js";
import { runValidation } from "./validate/index.js";

export interface HandleVaultChangeResult {
  archived: boolean;
  fixed: number;
  timestampRefreshed: boolean;
  indexUpdated: boolean;
  /** Whether one or more `<projectRoot>/indexes/*` files were rewritten. */
  indexesUpdated: boolean;
  /** Whether the cairndex region of CLAUDE.md was rewritten. */
  claudeMdUpdated: boolean;
}

const REFRESHABLE_DIRS = ["specs/", "decisions/", "plans/", "tasks/", "goals/", "questions/"];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function inVault(repoRoot: string, changedPath: string): boolean {
  const v = vaultPath(repoRoot);
  return changedPath.startsWith(v);
}

/** True if `changedPath` is the derived index layer that the cascade itself writes —
 *  used to break the regen→write→watch→regen loop. */
function inIndexesLayer(repoRoot: string, changedPath: string): boolean {
  const indexesRoot = join(vaultPath(repoRoot), INDEXES_DIR);
  return changedPath.startsWith(indexesRoot);
}

function vaultRelative(repoRoot: string, changedPath: string): string {
  return relative(vaultPath(repoRoot), changedPath).replace(/\\/g, "/");
}

function isRefreshableNode(repoRoot: string, changedPath: string): boolean {
  const rel = vaultRelative(repoRoot, changedPath);
  return REFRESHABLE_DIRS.some((d) => rel.startsWith(d));
}

async function refreshUpdatedField(filePath: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  const raw = await readFile(filePath, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const today = todayUtc();
  if (data.updated === today) return false;
  const next = normalizeFrontmatter({ ...data, updated: today }, { refreshTimestamp: true });
  await writeFile(filePath, serializeFrontmatter(next, content), "utf8");
  return true;
}

export async function handleVaultChange(
  repoRoot: string,
  cfg: Config,
  changedPath: string,
): Promise<HandleVaultChangeResult> {
  const result: HandleVaultChangeResult = {
    archived: false,
    fixed: 0,
    timestampRefreshed: false,
    indexUpdated: false,
    indexesUpdated: false,
    claudeMdUpdated: false,
  };

  if (!inVault(repoRoot, changedPath)) return result;

  // Loop guard: changes inside the derived layer are written by the cascade itself.
  // Re-running the cascade for those would deadlock on identical-content writes (idempotent
  // regenerators report changed=false, but we still don't want to spend the work).
  if (inIndexesLayer(repoRoot, changedPath)) return result;

  // 1. Archive if status flipped to removed/archived/abandoned. Must run before validation
  // because archived files no longer live at their original path.
  if (existsSync(changedPath)) {
    try {
      const dest = await archiveIfNeeded(repoRoot, cfg, changedPath);
      if (dest) result.archived = true;
    } catch {
      // archive failure is non-fatal; fall through.
    }
  }

  // If archived, the source path is gone — skip refresh and per-file validation, but still
  // run cross-file fixes (bidirectional) and try to refresh the index.
  if (!result.archived && isRefreshableNode(repoRoot, changedPath)) {
    try {
      result.timestampRefreshed = await refreshUpdatedField(changedPath);
    } catch {
      // ignore — the file might be a partial write; chokidar will fire again.
    }
  }

  // 2. Validate vault and apply auto-fixes scoped to this file plus cross-file (bidirectional).
  try {
    const all = await runValidation(repoRoot, cfg);
    const relevant = all.filter((i) => {
      if (!i.fixable) return false;
      if (i.rule === "bidirectional") return true; // reciprocal lives on the target file
      return i.path === changedPath;
    });
    if (relevant.length > 0) {
      const r = await applyAutoFixes(repoRoot, cfg, relevant);
      result.fixed = r.fixed.length;
    }
  } catch {
    // validation failure on a partial write is non-fatal.
  }

  // 3. Refresh index.md "Recent changes" block when changelog/sessions move.
  try {
    const rel = vaultRelative(repoRoot, changedPath);
    if (rel.startsWith("sessions/") || rel.startsWith("changes/") || result.archived) {
      const { regenerateRecentChanges } = await import("./indexUpdate.js");
      result.indexUpdated = await regenerateRecentChanges(repoRoot, cfg);
    }
  } catch {
    // indexUpdate may not exist in older builds; treat as best-effort.
  }

  // 4. Regenerate the indexes/ derived layer under the project root.
  let activeContextChanged = false;
  let memoryHealthChanged = false;
  try {
    const r = await regenerateAllIndexes(repoRoot, cfg);
    result.indexesUpdated = r.anyChanged;
    activeContextChanged = r.changed.activeContext;
    memoryHealthChanged = r.changed.memoryHealth;
  } catch {
    // best-effort; indexes regen is idempotent and will catch up on the next event.
  }

  // 5. Regenerate the cairndex region of CLAUDE.md when active-context or memory-health
  //    actually changed. Skipping when nothing changed avoids the chokidar loop on
  //    untouched runs (CLAUDE.md is at repo root, not inside the project memory dir, so a
  //    write here doesn't itself fire the watcher — but skipping no-op writes keeps mtime stable).
  if (activeContextChanged || memoryHealthChanged) {
    try {
      const view = await buildResumeView({ cwd: repoRoot });
      const watcherCfg = loadProjectConfig(repoRoot);
      const health = await buildMemoryHealth(repoRoot, watcherCfg);
      const body = renderAgentFlavor(view, { health });
      const claudeMdPath = join(repoRoot, "CLAUDE.md");
      const existing = existsSync(claudeMdPath) ? await readFile(claudeMdPath, "utf8") : undefined;
      const applied = applyCairndexBlock(existing, body);
      await writeFile(claudeMdPath, applied.updated, "utf8");
      // Keep state/resume.* in sync with the CLAUDE.md region (mirrors emitClaudeMd.ts).
      await writeResumeCache({ cwd: repoRoot, view });
      result.claudeMdUpdated = true;
    } catch {
      // best-effort; never block on CLAUDE.md regen.
    }
  }

  return result;
}
