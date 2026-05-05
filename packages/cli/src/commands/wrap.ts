import { promises as fs } from "node:fs";
import { join } from "node:path";
import { vaultPath, parseFrontmatter } from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";
import { runCloseOut } from "./closeout.js";

/**
 * `cairndex wrap` — redirects to the close-out flow.
 *
 * In TTY / interactive mode: delegates directly to `runCloseOut` (3-question flow).
 * In `--json` mode: emits a structured action descriptor so callers (slash command,
 * dashboard wrapper, scripts) can route to the appropriate UI surface.
 *
 * The old read-only report (Phase/Active-task/Session-next/Inbox/Doctor warnings)
 * is retired. Users who want a vault health check can run `cairndex doctor`.
 */
export interface WrapOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  json?: boolean;
}

export async function runWrap(opts: WrapOptions): Promise<void> {
  const root = resolveMemoryRoot(opts);
  const latest = await findLatestUnconfirmedSession(root);

  if (opts.json) {
    if (latest) {
      process.stdout.write(
        JSON.stringify({ action: "openCloseOut", sessionId: latest }) + "\n",
      );
    } else {
      process.stdout.write(JSON.stringify({ action: "nothingToClose" }) + "\n");
    }
    return;
  }

  if (!latest) {
    process.stdout.write(
      "Nothing to close out — most recent session is already confirmed (or no sessions yet).\n",
    );
    return;
  }

  // Delegate to interactive close-out — single source of truth for the 3-question flow.
  await runCloseOut({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    session: latest,
  });
}

/**
 * Scan the sessions directory for the latest (alphabetically last) session file.
 * Returns its ID (filename without `.md`) when its `narrative_status` is `"empty"`,
 * or `null` when the vault has no sessions or the latest is already confirmed.
 */
async function findLatestUnconfirmedSession(root: string): Promise<string | null> {
  const sessionsDir = join(vaultPath(root), "sessions");
  try {
    const entries = await fs.readdir(sessionsDir);
    const sessionFiles = entries.filter((e) => e.endsWith(".md"));
    if (sessionFiles.length === 0) return null;
    sessionFiles.sort().reverse(); // latest first (sessions use date-prefix IDs)
    const latestFile = sessionFiles[0];
    if (!latestFile) return null;
    const raw = await fs.readFile(join(sessionsDir, latestFile), "utf8");
    const { data } = parseFrontmatter<{ narrative_status?: string }>(raw);
    if (data.narrative_status === "empty") {
      return latestFile.replace(/\.md$/, "");
    }
    return null;
  } catch {
    return null;
  }
}
