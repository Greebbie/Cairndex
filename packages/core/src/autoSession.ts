import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
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

function emptyToolCounts(): ToolCounts {
  return { Edit: 0, Write: 0, Bash: 0, Read: 0 };
}

interface ToolUseBlock {
  type?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface TranscriptEntry {
  type?: string;
  message?: { content?: ToolUseBlock[] };
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

function renderToolCounts(counts: ToolCounts): string {
  return `Edit×${counts.Edit} Write×${counts.Write} Bash×${counts.Bash} Read×${counts.Read}`;
}

export async function generateAutoSession(
  input: GenerateAutoSessionInput,
): Promise<GenerateAutoSessionResult> {
  const id = formatSessionId(input.now, { utc: true });
  const date = id.slice(0, 10);

  const ids = new Set<string>();
  for (const p of input.touchedPaths) {
    for (const found of extractIdsFromString(p)) {
      if (parseId(found)) ids.add(found);
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

  const sections = [
    "## What I did",
    "",
    "(TODO: describe the work in 1–3 bullets.)",
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

  sections.push("## Next", "", "(TODO: one-line next action.)");

  const body = sections.join("\n");

  const folder = nodeFolderPath(input.repoRoot, folderForNodeType(input.cfg, "session"));
  await mkdir(folder, { recursive: true });

  let suffix = 0;
  let outputPath = join(folder, `${id}.md`);
  while (existsSync(outputPath)) {
    suffix += 1;
    outputPath = join(folder, `${id}-${suffix}.md`);
  }

  await writeFile(outputPath, serializeFrontmatter(frontmatter, `\n${body}\n`), "utf8");

  return { id, path: outputPath };
}
