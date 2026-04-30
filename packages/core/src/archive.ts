import { existsSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType, nodeTypeForFolder } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import { archivePath, vaultPath } from "./paths.js";
import { NODE_TYPES } from "./types.js";
import { listNodeFiles } from "./vault.js";

const ARCHIVE_STATUSES = new Set(["removed", "archived", "abandoned"]);

export async function archiveIfNeeded(
  repoRoot: string,
  _cfg: Config,
  filePath: string,
): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, "utf8");
  const { data } = parseFrontmatter(raw);
  const status = String((data as Record<string, unknown>).status ?? "");
  if (!ARCHIVE_STATUSES.has(status)) return null;
  const vault = vaultPath(repoRoot);
  const rel = relative(vault, filePath); // e.g., "specs/SPEC-001-x.md"
  const dest = join(archivePath(repoRoot), rel);
  await mkdir(dirname(dest), { recursive: true });
  await rename(filePath, dest);
  return dest;
}

export async function archiveAllStaleStatuses(repoRoot: string, cfg: Config): Promise<string[]> {
  const moved: string[] = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) {
      const status = String(f.frontmatter.status ?? "");
      if (!ARCHIVE_STATUSES.has(status)) continue;
      const dest = await archiveIfNeeded(repoRoot, cfg, f.path);
      if (dest) moved.push(dest);
    }
  }
  return moved;
}

export function isArchivable(status: string): boolean {
  return ARCHIVE_STATUSES.has(status);
}

// suppress unused-import lint
void nodeTypeForFolder;
void basename;
void folderForNodeType;
