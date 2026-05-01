import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { sha256 } from "./hash.js";
import { assertContained } from "./safePath.js";

export interface SyncResult {
  fastForwarded: string[];
  skippedLocalEdits: string[];
  conflicts: string[];
}

export interface SyncInput {
  globalDir: string; // ~/.cairndex/shared
  projectDir: string; // <repo> (NOT <repo>/.cairndex)
}

const TRACKED_SUBDIRS = ["rules", "templates"] as const;
const BASELINE_FILE = ".cairndex/.sync-baseline.json";
const CONFLICTS_DIR = ".cairndex/.sync-conflicts";

async function listMarkdownRel(dir: string, base: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(relative(base, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

async function readMaybe(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return await readFile(path, "utf8");
}

export async function readSyncBaseline(projectDir: string): Promise<Record<string, string>> {
  const p = join(projectDir, BASELINE_FILE);
  if (!existsSync(p)) return {};
  const raw = await readFile(p, "utf8");
  try {
    const data = JSON.parse(raw) as { hashes?: Record<string, string> };
    return data.hashes ?? {};
  } catch {
    return {};
  }
}

export async function writeSyncBaseline(
  projectDir: string,
  contents: Record<string, string>,
): Promise<void> {
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(contents)) hashes[k] = sha256(v);
  const p = join(projectDir, BASELINE_FILE);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ hashes }, null, 2), "utf8");
}

async function updateBaselineEntry(
  projectDir: string,
  rel: string,
  content: string,
): Promise<void> {
  const baseline = await readSyncBaseline(projectDir);
  baseline[rel] = sha256(content);
  const p = join(projectDir, BASELINE_FILE);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ hashes: baseline }, null, 2), "utf8");
}

export async function runSync(input: SyncInput): Promise<SyncResult> {
  const { globalDir, projectDir } = input;
  const projectVault = join(projectDir, ".cairndex");

  // Collect candidate files from both sides under tracked subdirs.
  const candidates = new Set<string>();
  for (const sub of TRACKED_SUBDIRS) {
    for (const f of await listMarkdownRel(join(globalDir, sub), globalDir)) candidates.add(f);
    for (const f of await listMarkdownRel(join(projectVault, sub), projectVault)) candidates.add(f);
  }

  const baseline = await readSyncBaseline(projectDir);
  const result: SyncResult = { fastForwarded: [], skippedLocalEdits: [], conflicts: [] };

  for (const rel of candidates) {
    const globalPath = join(globalDir, rel);
    const projectPath = join(projectVault, rel);
    const globalContent = await readMaybe(globalPath);
    const projectContent = await readMaybe(projectPath);
    const baseHash = baseline[rel];

    const globalHash = globalContent != null ? sha256(globalContent) : null;
    const projectHash = projectContent != null ? sha256(projectContent) : null;

    // Treat a missing baseline entry + missing local file as "unchanged from baseline"
    // so brand-new global files fast-forward instead of conflict.
    const globalChanged = baseHash === undefined ? globalHash !== null : globalHash !== baseHash;
    const projectChanged = baseHash === undefined ? projectHash !== null : projectHash !== baseHash;

    if (!globalChanged && !projectChanged) continue;

    if (globalChanged && !projectChanged) {
      // fast-forward
      if (globalContent != null) {
        try {
          assertContained(projectPath, projectVault);
        } catch (err) {
          console.warn(`sync: skipping path traversal attempt for ${rel}:`, err);
          continue;
        }
        await mkdir(dirname(projectPath), { recursive: true });
        await writeFile(projectPath, globalContent, "utf8");
        await updateBaselineEntry(projectDir, rel, globalContent);
      }
      result.fastForwarded.push(rel);
      continue;
    }

    if (!globalChanged && projectChanged) {
      result.skippedLocalEdits.push(rel);
      continue;
    }

    // both changed → conflict
    const conflictPath = join(projectDir, CONFLICTS_DIR, rel);
    await mkdir(dirname(conflictPath), { recursive: true });
    const globalBlock = globalContent ?? "(missing)\n";
    const projectBlock = projectContent ?? "(missing)\n";
    const body = `<!-- cairndex sync conflict for ${rel} -->\n\n## <<<<<<< global (~/.cairndex/shared/${rel})\n${globalBlock}\n## =======\n${projectBlock}\n## >>>>>>> project (${rel})\n`;
    await writeFile(conflictPath, body, "utf8");
    result.conflicts.push(rel);
  }

  return result;
}
