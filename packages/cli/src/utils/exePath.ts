import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Resolve a directory shipped alongside the running executable.
 *
 * Used by the SEA portable layout — Cairndex.exe sits in a folder with
 * `web/` and `templates/` next to it, and `process.execPath` points at the
 * exe itself. Returns undefined when no such sibling directory exists, so
 * callers can fall through to dev/packaged candidates.
 */
export function findExeRelative(subdir: string): string | undefined {
  const candidate = join(dirname(process.execPath), subdir);
  return existsSync(candidate) ? candidate : undefined;
}
