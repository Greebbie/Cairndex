import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "../paths.js";

/**
 * Memory-bearing folders that the pack distills from. A change in any of these
 * is a reason to consider the latest pack stale. We intentionally exclude
 * `indexes/` (which contains the pack itself and the active-context cache —
 * including them would create a feedback loop where rebuilding the pack
 * immediately marks itself stale) and `archive/` (cold storage by definition).
 *
 * `inbox/` IS included: when the agent proposes new memory, the pack should
 * advertise itself as stale until rebuilt — that's the whole point of this
 * signal. The cost is only that proposing-and-then-rebuilding is now a
 * two-step rhythm, which matches how vibe coding actually flows.
 */
const MEMORY_FOLDERS = [
  "specs",
  "decisions",
  "plans",
  "tasks",
  "sessions",
  "changes",
  "insights",
  "questions",
  "goals",
  "rules",
  "inbox",
] as const;

/**
 * Newest mtime, in ms since epoch, of any memory file under `projectRoot`.
 * Walks each known memory folder one level deep — proposal/session files
 * commonly nest inside `inbox/proposed-memory-updates/` etc. — so we recurse
 * but cap the depth to keep this O(n) cheap on any reasonable vault.
 *
 * Returns `null` when there are no memory files at all (a freshly initialized
 * vault). Callers should treat null as "nothing to be stale relative to."
 */
export async function lastMemoryChangeMs(projectRoot: string): Promise<number | null> {
  const root = vaultPath(projectRoot);
  let max: number | null = null;
  for (const folder of MEMORY_FOLDERS) {
    const folderPath = join(root, folder);
    const m = await maxMtimeMs(folderPath, 3);
    if (m !== null && (max === null || m > max)) max = m;
  }
  return max;
}

/**
 * ISO-string flavor of `lastMemoryChangeMs`. Convenient for surfacing on API
 * responses since the rest of the pack metadata is already strings.
 */
export async function lastMemoryChangeAt(projectRoot: string): Promise<string | null> {
  const ms = await lastMemoryChangeMs(projectRoot);
  return ms === null ? null : new Date(ms).toISOString();
}

async function maxMtimeMs(dir: string, depth: number): Promise<number | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  let max: number | null = null;
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) {
        const m = await maxMtimeMs(p, depth - 1);
        if (m !== null && (max === null || m > max)) max = m;
      }
    } else if (e.isFile()) {
      try {
        const s = await stat(p);
        if (max === null || s.mtimeMs > max) max = s.mtimeMs;
      } catch {
        // best-effort
      }
    }
  }
  return max;
}
