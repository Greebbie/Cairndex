import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { contextPacksPath } from "../paths.js";
import { lastMemoryChangeAt } from "./staleness.js";

export interface LatestPackInfo {
  /** Pack id from frontmatter, falling back to the filename without `.md`. */
  id: string;
  /** Absolute path to the pack file on disk. */
  path: string;
  /** ISO timestamp the pack was built (from frontmatter, or file mtime as fallback). */
  builtAt: string;
}

export interface LatestPackWithStaleness extends LatestPackInfo {
  /**
   * ISO timestamp of the newest memory mtime when this snapshot was computed.
   * Null when the vault has no memory files yet.
   */
  lastMemoryChangeAt: string | null;
  /** True iff `builtAt` is older than `lastMemoryChangeAt`. */
  stale: boolean;
}

const FRONTMATTER_BUILT_AT_RE = /^builtAt:\s*['"]?([^'"\n]+)['"]?/m;
const FRONTMATTER_ID_RE = /^id:\s*(\S+)/m;

/**
 * Find the most-recently-modified context pack under `<projectRoot>/indexes/context-packs/`,
 * or null when no packs have been built yet. Reads only the file's frontmatter — the body
 * (which can be tens of KB) is not loaded.
 *
 * Used by the dashboard route, the bootstrap CLI command, and any other surface that
 * needs to answer "what's the most recent pack the agent might be relying on?". Keeping
 * the lookup centralized prevents the kind of drift Codex flagged in the first round
 * (one surface knowing about staleness, another not).
 */
export async function findLatestPack(projectRoot: string): Promise<LatestPackInfo | null> {
  const dir = contextPacksPath(projectRoot);
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  const stats = await Promise.all(
    entries.map(async (f) => {
      try {
        const s = await stat(join(dir, f));
        return { f, m: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const valid = stats.filter((s): s is { f: string; m: number } => s !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.m - a.m);
  const newest = valid[0];
  if (!newest) return null;

  const fullPath = join(dir, newest.f);
  let builtAt = new Date(newest.m).toISOString();
  let id = newest.f.replace(/\.md$/, "");
  try {
    const raw = await readFile(fullPath, "utf8");
    // Read only the leading frontmatter block — first `---` to next `---`.
    const fmEnd = raw.indexOf("---") === 0 ? raw.indexOf("---", 3) : -1;
    const fmBlock = fmEnd > 0 ? raw.slice(0, fmEnd) : "";
    const builtAtMatch = FRONTMATTER_BUILT_AT_RE.exec(fmBlock);
    if (builtAtMatch?.[1]) builtAt = builtAtMatch[1].trim();
    const idMatch = FRONTMATTER_ID_RE.exec(fmBlock);
    if (idMatch?.[1]) id = idMatch[1].trim();
  } catch {
    // best-effort — fall back to filename + mtime
  }

  return { id, path: fullPath, builtAt };
}

/**
 * Convenience wrapper that combines `findLatestPack` with `lastMemoryChangeAt` and
 * derives the `stale` boolean. Returns null when there is no pack to report on
 * (vs. returning a record with `stale: false` for a fresh pack — callers can check
 * `result === null` to distinguish "nothing built yet" from "built and current").
 */
export async function findLatestPackWithStaleness(
  projectRoot: string,
): Promise<LatestPackWithStaleness | null> {
  const latest = await findLatestPack(projectRoot);
  if (!latest) return null;
  const memChange = await lastMemoryChangeAt(projectRoot);
  const stale =
    !!latest.builtAt &&
    !!memChange &&
    new Date(latest.builtAt).getTime() < new Date(memChange).getTime();
  return { ...latest, lastMemoryChangeAt: memChange, stale };
}
