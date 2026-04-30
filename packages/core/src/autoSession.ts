import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType } from "./config.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { formatSessionId, parseId } from "./ids.js";
import { nodeFolderPath } from "./paths.js";

export interface GenerateAutoSessionInput {
  repoRoot: string;
  cfg: Config;
  now: Date;
  touchedPaths: readonly string[];
  summary?: string;
  agentName?: string;
}

export interface GenerateAutoSessionResult {
  id: string;
  path: string;
}

const ID_RE = /([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4})/g;

function extractIdsFromPath(p: string): string[] {
  const out: string[] = [];
  ID_RE.lastIndex = 0;
  let m: RegExpExecArray | null = ID_RE.exec(p);
  while (m !== null) {
    if (m[1]) out.push(m[1]);
    m = ID_RE.exec(p);
  }
  return out;
}

export async function generateAutoSession(
  input: GenerateAutoSessionInput,
): Promise<GenerateAutoSessionResult> {
  const id = formatSessionId(input.now, { utc: true });
  const date = id.slice(0, 10);

  // Collect touched IDs (sequential SPEC/ADR/etc. or session-format).
  const ids = new Set<string>();
  for (const p of input.touchedPaths) {
    for (const found of extractIdsFromPath(p)) {
      // skip session-format IDs as touch targets
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
    : "- (no .cairndex files touched)";

  const idsList = links.length ? links.map((l) => `- [[${l.target}]]`).join("\n") : "- (none)";

  const body = [
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
    "## Next",
    "",
    "(TODO: one-line next action.)",
  ].join("\n");

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
