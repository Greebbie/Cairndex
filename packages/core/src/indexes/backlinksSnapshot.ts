import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Backlink, computeBacklinks } from "../backlinks.js";
import type { Config } from "../config.js";
import { backlinksPath } from "../paths.js";

export interface BacklinksSnapshotEntry {
  target: string;
  backlinks: Backlink[];
}

export interface BacklinksSnapshot {
  generatedAt: string;
  entries: BacklinksSnapshotEntry[];
}

export async function buildBacklinksSnapshot(
  repoRoot: string,
  cfg: Config,
): Promise<BacklinksSnapshot> {
  const idx = await computeBacklinks(repoRoot, cfg);
  const entries: BacklinksSnapshotEntry[] = [];
  for (const [target, backlinks] of idx.entries()) {
    entries.push({ target, backlinks: [...backlinks] });
  }
  // Stable sort by target id for idempotent output.
  entries.sort((a, b) => (a.target < b.target ? -1 : a.target > b.target ? 1 : 0));
  return { generatedAt: new Date().toISOString(), entries };
}

interface CompareableSnapshot {
  entries: BacklinksSnapshot["entries"];
}

function withoutGeneratedAt(s: BacklinksSnapshot): CompareableSnapshot {
  return { entries: s.entries };
}

export interface RegenerateBacklinksSnapshotResult {
  path: string;
  snapshot: BacklinksSnapshot;
  changed: boolean;
}

export async function regenerateBacklinksSnapshot(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateBacklinksSnapshotResult> {
  const snapshot = await buildBacklinksSnapshot(repoRoot, cfg);
  const path = backlinksPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  let changed = true;
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8")) as BacklinksSnapshot;
      changed =
        JSON.stringify(withoutGeneratedAt(prev)) !== JSON.stringify(withoutGeneratedAt(snapshot));
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }
  return { path, snapshot, changed };
}
