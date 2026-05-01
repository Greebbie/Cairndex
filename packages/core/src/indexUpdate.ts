import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import { indexPath, nodeFolderPath, vaultPath } from "./paths.js";

export const RECENT_CHANGES_START = "<!-- cairndex:recent-changes:start -->";
export const RECENT_CHANGES_END = "<!-- cairndex:recent-changes:end -->";

export interface RegenerateRecentChangesOptions {
  /** How many entries to render (default 10). */
  limit?: number;
}

interface FeedEntry {
  date: string;
  text: string;
}

function compareDateDesc(a: FeedEntry, b: FeedEntry): number {
  if (a.date === b.date) return 0;
  return a.date < b.date ? 1 : -1;
}

async function readChangelogEntries(repoRoot: string): Promise<FeedEntry[]> {
  const path = join(vaultPath(repoRoot), "changes", "changelog.md");
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const out: FeedEntry[] = [];
  const re = /^\s*-\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    if (m[1] && m[2]) out.push({ date: m[1], text: m[2] });
    m = re.exec(raw);
  }
  return out;
}

async function readRecentSessions(repoRoot: string, cfg: Config): Promise<FeedEntry[]> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, "session"));
  if (!existsSync(folder)) return [];
  const entries = await readdir(folder);
  const out: FeedEntry[] = [];
  for (const e of entries) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    const full = join(folder, e);
    try {
      const raw = await readFile(full, "utf8");
      const { data } = parseFrontmatter<Record<string, unknown>>(raw);
      const date = String(data.date ?? "").slice(0, 10);
      const id = String(data.id ?? basename(e, ".md"));
      const summary = String(data.summary ?? "").trim();
      if (!date) continue;
      const text = summary ? `session ${id}: ${summary}` : `session ${id}`;
      out.push({ date, text });
    } catch {
      // skip malformed
    }
  }
  return out;
}

function renderBlock(entries: readonly FeedEntry[]): string {
  if (entries.length === 0) return "(no recent activity)";
  return entries.map((e) => `- ${e.date} — ${e.text}`).join("\n");
}

function replaceMarkedBlock(source: string, replacement: string): string | null {
  const startIdx = source.indexOf(RECENT_CHANGES_START);
  const endIdx = source.indexOf(RECENT_CHANGES_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  const before = source.slice(0, startIdx + RECENT_CHANGES_START.length);
  const after = source.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

export async function regenerateRecentChanges(
  repoRoot: string,
  cfg: Config,
  opts: RegenerateRecentChangesOptions = {},
): Promise<boolean> {
  const idxPath = indexPath(repoRoot);
  if (!existsSync(idxPath)) return false;
  const limit = opts.limit ?? 10;

  const entries: FeedEntry[] = [
    ...(await readChangelogEntries(repoRoot)),
    ...(await readRecentSessions(repoRoot, cfg)),
  ];
  entries.sort(compareDateDesc);
  const top = entries.slice(0, limit);

  const current = await readFile(idxPath, "utf8");
  const replaced = replaceMarkedBlock(current, renderBlock(top));
  if (replaced === null) return false;
  if (replaced === current) return false;

  await writeFile(idxPath, replaced, "utf8");
  return true;
}
