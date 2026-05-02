import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Config, folderForNodeType } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { formatSessionId } from "./ids.js";
import { applyPatch } from "./inbox/applyPatch.js";
import { nodeFolderPath } from "./paths.js";

export type SessionLogKind = "progress" | "verify" | "decision";

const SECTION_FOR_KIND: Record<SessionLogKind, string> = {
  progress: "## Progress",
  verify: "## Verification",
  decision: "## Decisions",
};

export interface AppendToSessionInput {
  repoRoot: string;
  cfg: Config;
  now: Date;
  kind: SessionLogKind;
  /** Free-form text. A timestamp prefix is added automatically. */
  text: string;
  /** Optional override of the agent name; defaults to "cairndex-session-log". */
  agentName?: string;
}

export interface AppendToSessionResult {
  /** Session id (date-based, like 2026-05-02-2130). */
  sessionId: string;
  /** Absolute path of the session markdown file. */
  path: string;
  /** Heading of the section that was appended to. */
  section: string;
  /** True if this call created the session file (vs. appended to an existing one). */
  created: boolean;
}

/**
 * Append a single timestamped bullet to a section in the active session file,
 * creating the file from a minimal template if it doesn't exist yet. Direct
 * write — does NOT go through the proposal inbox, because session notes are
 * observational audit records, not durable memory subject to human review.
 *
 * Reuses the inbox/applyPatch section parser so behavior is consistent with
 * patch-mode proposals.
 */
export async function appendToSession(input: AppendToSessionInput): Promise<AppendToSessionResult> {
  const folder = nodeFolderPath(input.repoRoot, folderForNodeType(input.cfg, "session"));
  await mkdir(folder, { recursive: true });

  const section = SECTION_FOR_KIND[input.kind];
  const bullet = formatBullet(input.now, input.text);

  const existing = await findActiveSessionFile(folder);
  if (existing) {
    const raw = await readFile(existing.path, "utf8");
    const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
    const nextBody = applyPatch(content, [{ kind: "append-section", section, content: bullet }]);
    await writeFile(existing.path, serializeFrontmatter(data, nextBody), "utf8");
    return {
      sessionId: existing.id,
      path: existing.path,
      section,
      created: false,
    };
  }

  // Create a fresh session file with empty placeholder sections.
  const sessionId = formatSessionId(input.now, { utc: true });
  const date = sessionId.slice(0, 10);
  const frontmatter = {
    id: sessionId,
    date,
    summary: "TODO: one-line summary",
    provenance: {
      created_by: input.agentName ?? "cairndex-session-log",
      session: sessionId,
    },
    links: [] as Array<{ type: string; target: string }>,
  };

  const initialSections = [
    "## Progress",
    "",
    "## Verification",
    "",
    "## Decisions",
    "",
    "## Next",
    "",
    "(TODO: one-line next action.)",
  ];
  // Apply the bullet via applyPatch so the section-append logic is identical
  // to the existing-file path.
  const initialBody = `\n${initialSections.join("\n")}\n`;
  const seededBody = applyPatch(initialBody, [
    { kind: "append-section", section, content: bullet },
  ]);

  const filePath = join(folder, `${sessionId}.md`);
  await writeFile(filePath, serializeFrontmatter(frontmatter, seededBody), "utf8");
  return { sessionId, path: filePath, section, created: true };
}

interface ActiveSession {
  id: string;
  path: string;
}

/**
 * Resolve the "active" session = newest session-id file in the session folder.
 * Returns null if the folder doesn't exist or has no recognizable session files.
 */
async function findActiveSessionFile(folder: string): Promise<ActiveSession | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  const sessions = entries
    .filter((e) => e.endsWith(".md") && /^\d{4}-\d{2}-\d{2}-\d{4}/.test(e))
    .sort();
  const newest = sessions.at(-1);
  if (!newest) return null;
  // Strip optional `-<suffix>` and `.md` to recover the session id.
  const stem = newest.replace(/\.md$/, "");
  const id = stem.match(/^\d{4}-\d{2}-\d{2}-\d{4}/)?.[0] ?? stem;
  return { id, path: join(folder, newest) };
}

function formatBullet(now: Date, text: string): string {
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const trimmed = text.trimEnd();
  return `- ${hh}:${mm} UTC — ${trimmed}\n`;
}
