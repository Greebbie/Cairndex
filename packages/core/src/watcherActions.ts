import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { archiveIfNeeded } from "./archive.js";
import type { Config } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { normalizeFrontmatter } from "./normalize.js";
import { vaultPath } from "./paths.js";
import { applyAutoFixes } from "./validate/fix.js";
import { runValidation } from "./validate/index.js";

export interface HandleVaultChangeResult {
  archived: boolean;
  fixed: number;
  timestampRefreshed: boolean;
  indexUpdated: boolean;
}

const REFRESHABLE_DIRS = ["specs/", "decisions/", "plans/", "tasks/", "goals/", "questions/"];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function inVault(repoRoot: string, changedPath: string): boolean {
  const v = vaultPath(repoRoot);
  return changedPath.startsWith(v);
}

function isRefreshableNode(changedPath: string): boolean {
  const norm = changedPath.replace(/\\/g, "/");
  return REFRESHABLE_DIRS.some((d) => norm.includes(`/.cairndex/${d}`));
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
  };

  if (!inVault(repoRoot, changedPath)) return result;

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
  if (!result.archived && isRefreshableNode(changedPath)) {
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
    const norm = changedPath.replace(/\\/g, "/");
    if (
      norm.includes("/.cairndex/sessions/") ||
      norm.includes("/.cairndex/changes/") ||
      result.archived
    ) {
      const { regenerateRecentChanges } = await import("./indexUpdate.js");
      result.indexUpdated = await regenerateRecentChanges(repoRoot, cfg);
    }
  } catch {
    // indexUpdate may not exist in older builds; treat as best-effort.
  }

  return result;
}
