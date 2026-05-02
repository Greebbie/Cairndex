import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vaultPath } from "./paths.js";

/**
 * Path to the per-project changelog: `<vault>/changes/changelog.md`. The "vault"
 * here is the directory holding durable memory for this project (legacy or central
 * — `vaultPath` already resolves both).
 */
export function changelogPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), "changes", "changelog.md");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a single dated bullet to `<vault>/changes/changelog.md`. Used by every
 * flow that mutates durable memory (proposal create/accept/reject, auto-session
 * write) so Dashboard's RECENT ACTIVITY card and the Timeline page actually
 * reflect agent activity. Without these calls, the changelog only has the
 * one-shot "cairndex initialized" line that `cairndex init` writes.
 *
 * Behavior:
 *   - Creates the file (and the `changes/` folder) if missing, with a `# Changelog`
 *     header so the markdown is well-formed when first viewed.
 *   - Subsequent calls just `appendFile` a single bullet line.
 *   - Date prefix is UTC YYYY-MM-DD to match the dashboard's parser
 *     (`packages/server/src/routes/dashboard.ts::parseRecentActivity`, which expects
 *     `- YYYY-MM-DD — <summary>`).
 *   - Caller passes the summary text only — the date and bullet/dash are added here.
 *   - Errors (filesystem unavailable, permission denied) are swallowed: the changelog
 *     append is observability, never load-bearing for the proposal/session write
 *     itself. If we can't write the changelog, the durable memory still landed.
 *
 * Pass `now` for deterministic tests; defaults to current UTC date.
 */
export async function appendChangelog(
  repoRoot: string,
  summary: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const path = changelogPath(repoRoot);
    const dateStr = now.toISOString().slice(0, 10);
    const line = `- ${dateStr} — ${summary}\n`;
    if (!existsSync(path)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `# Changelog\n\n${line}`, "utf8");
      return;
    }
    await appendFile(path, line, "utf8");
  } catch {
    // Swallowed by design — see jsdoc.
  }
}

// Suppress the unused-import warning for `todayUtc` even when we delete it later;
// kept exported for any caller that wants a plain UTC date string consistent with
// changelog entries (e.g. test fixtures, audit-trail builders).
export { todayUtc };
