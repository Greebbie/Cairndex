import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { appendChangelog } from "./changelog.js";
import type { Config } from "./config.js";
import { folderForNodeType } from "./config.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { formatSessionId, parseId } from "./ids.js";
import { nodeFolderPath } from "./paths.js";

export interface ToolCounts {
  Edit: number;
  Write: number;
  Bash: number;
  Read: number;
}

export interface ParsedTranscript {
  touchedPaths: string[];
  idsReferenced: string[];
  toolCounts: ToolCounts;
}

export interface GenerateAutoSessionInput {
  repoRoot: string;
  cfg: Config;
  now: Date;
  touchedPaths: readonly string[];
  summary?: string;
  next?: string;
  agentName?: string;
  /** Optional structured tool-call summary. When provided, rendered as a "Tool calls" line. */
  toolCounts?: ToolCounts;
}

export interface GenerateAutoSessionResult {
  id: string;
  path: string;
}

const ID_RE = /([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4})/g;

function extractIdsFromString(s: string): string[] {
  const out: string[] = [];
  ID_RE.lastIndex = 0;
  let m: RegExpExecArray | null = ID_RE.exec(s);
  while (m !== null) {
    if (m[1]) out.push(m[1]);
    m = ID_RE.exec(s);
  }
  return out;
}

/**
 * PROP-NNN identifies inbox proposals, not durable memory. Sessions referencing them
 * via `links.touches` produce reference-integrity errors because the validator only
 * scans durable folders for known IDs (PROPs live in inbox/proposed-memory-updates/).
 * The proposal itself records its session via `provenance.session`, so the inverse
 * link is redundant noise. Filter at the auto-session caller boundary, NOT in
 * extractIdsFromString — parseTranscriptJsonl callers (cairndex status,
 * last-turn-summary) DO want to count PROP references.
 */
const NON_DURABLE_ID_PREFIXES = new Set(["PROP"]);

function isDurableId(id: string): boolean {
  const prefix = id.split("-")[0];
  return prefix !== undefined && !NON_DURABLE_ID_PREFIXES.has(prefix);
}

function emptyToolCounts(): ToolCounts {
  return { Edit: 0, Write: 0, Bash: 0, Read: 0 };
}

interface ContentBlock {
  type?: string;
  // tool_use fields:
  name?: string;
  input?: Record<string, unknown>;
  // text fields:
  text?: string;
}

interface TranscriptEntry {
  type?: string;
  message?: { content?: ContentBlock[] | string };
}

export async function parseTranscriptJsonl(transcriptPath: string): Promise<ParsedTranscript> {
  const empty: ParsedTranscript = {
    touchedPaths: [],
    idsReferenced: [],
    toolCounts: emptyToolCounts(),
  };
  if (!existsSync(transcriptPath)) return empty;

  let raw: string;
  try {
    raw = await readFile(transcriptPath, "utf8");
  } catch {
    return empty;
  }

  const touched = new Set<string>();
  const ids = new Set<string>();
  const counts = emptyToolCounts();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(trimmed) as TranscriptEntry;
    } catch {
      continue;
    }
    const blocks = entry.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const b of blocks) {
      if (!b || b.type !== "tool_use" || typeof b.name !== "string") continue;
      const name = b.name;
      if (name === "Edit" || name === "Write" || name === "Bash" || name === "Read") {
        counts[name] += 1;
      }
      const input = (b.input ?? {}) as Record<string, unknown>;
      if (typeof input.file_path === "string") touched.add(input.file_path);
      if (typeof input.path === "string") touched.add(input.path);
      // Collect IDs from any string-valued arg (file paths, commands, etc.)
      for (const v of Object.values(input)) {
        if (typeof v === "string") {
          for (const id of extractIdsFromString(v)) ids.add(id);
        }
      }
    }
  }

  return {
    touchedPaths: Array.from(touched),
    idsReferenced: Array.from(ids),
    toolCounts: counts,
  };
}

/**
 * Read a Claude Code transcript JSONL and return the concatenated text content from
 * every text block (both assistant and user messages). Used by auto-distill to feed
 * decision-phrase heuristics with the actual conversation, not just the boilerplate
 * session note that starts as a TODO placeholder.
 *
 * Returns an empty string when the file is missing or unreadable so callers can
 * concatenate the result without null checks.
 */
export async function extractTranscriptText(transcriptPath: string): Promise<string> {
  if (!existsSync(transcriptPath)) return "";
  let raw: string;
  try {
    raw = await readFile(transcriptPath, "utf8");
  } catch {
    return "";
  }
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(trimmed) as TranscriptEntry;
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (typeof content === "string") {
      // User messages occasionally arrive as a plain string — keep them.
      out.push(content);
    } else if (Array.isArray(content)) {
      for (const b of content) {
        if (b && b.type === "text" && typeof b.text === "string") {
          out.push(b.text);
        }
      }
    }
  }
  return out.join("\n");
}

function renderToolCounts(counts: ToolCounts): string {
  return `Edit×${counts.Edit} Write×${counts.Write} Bash×${counts.Bash} Read×${counts.Read}`;
}

export async function generateAutoSession(
  input: GenerateAutoSessionInput,
): Promise<GenerateAutoSessionResult> {
  const baseId = formatSessionId(input.now, { utc: true });
  const folder = nodeFolderPath(input.repoRoot, folderForNodeType(input.cfg, "session"));
  await mkdir(folder, { recursive: true });

  // Compute the final id BEFORE building frontmatter so the filename and the
  // frontmatter `id` field always agree. Previously the filename got `-1`/`-2`
  // suffixes on minute-precision collisions but `frontmatter.id` stayed the same,
  // tripping the id-collision validator.
  let suffix = 0;
  let id = baseId;
  let outputPath = join(folder, `${id}.md`);
  while (existsSync(outputPath)) {
    suffix += 1;
    id = `${baseId}-${suffix}`;
    outputPath = join(folder, `${id}.md`);
  }

  const date = baseId.slice(0, 10);

  const ids = new Set<string>();
  for (const p of input.touchedPaths) {
    for (const found of extractIdsFromString(p)) {
      // Skip PROP-NNN — proposals are inbox-only, not durable; linking them as
      // `touches` from a session creates bogus reference-integrity errors.
      if (parseId(found) && isDurableId(found)) ids.add(found);
    }
  }

  const links = Array.from(ids).map((target) => ({ type: "touches", target }));

  const frontmatter = {
    id,
    date,
    summary: input.summary ?? "TODO: one-line summary",
    provenance: {
      created_by: input.agentName ?? "cairndex-auto-session",
      session: id,
    },
    links,
  };

  const touchedList = input.touchedPaths.length
    ? input.touchedPaths.map((p) => `- ${basename(p)} (\`${p}\`)`).join("\n")
    : "- (no files touched)";

  const idsList = links.length ? links.map((l) => `- [[${l.target}]]`).join("\n") : "- (none)";
  const whatIDid =
    input.summary && input.summary.trim().length > 0
      ? `- ${input.summary.trim()}`
      : "(TODO: describe the work in 1-3 bullets.)";
  const next =
    input.next && input.next.trim().length > 0
      ? input.next.trim()
      : "Continue from the dashboard active task and next action.";

  const sections = [
    "## What I did",
    "",
    whatIDid,
    "",
    "## Files touched",
    "",
    touchedList,
    "",
    "## Nodes referenced",
    "",
    idsList,
    "",
  ];

  if (input.toolCounts) {
    sections.push("## Tool calls", "", renderToolCounts(input.toolCounts), "");
  }

  sections.push("## Next", "", next);

  const body = sections.join("\n");

  await writeFile(outputPath, serializeFrontmatter(frontmatter, `\n${body}\n`), "utf8");

  // Activity-stream entry. Tool counts (when available) make the line useful at a
  // glance from the dashboard's Recent Activity card.
  const toolSummary = input.toolCounts ? ` (${renderToolCounts(input.toolCounts)})` : "";
  await appendChangelog(input.repoRoot, `Session ${id} recorded${toolSummary}`);

  return { id, path: outputPath };
}
