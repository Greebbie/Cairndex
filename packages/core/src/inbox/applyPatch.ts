import type { Patch, PatchOp } from "./types.js";

interface SectionRange {
  startLine: number;
  endLine: number;
  level: number;
  heading: string;
}

function parseSections(body: string): { lines: string[]; sections: SectionRange[] } {
  const lines = body.split("\n");
  const sections: SectionRange[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+\S/.exec(line);
    if (!m || m[1] === undefined) continue;
    sections.push({
      startLine: i,
      endLine: lines.length,
      level: m[1].length,
      heading: line.trim(),
    });
  }
  for (let s = 0; s < sections.length - 1; s++) {
    const cur = sections[s];
    const next = sections[s + 1];
    if (cur && next) cur.endLine = next.startLine;
  }
  return { lines, sections };
}

function findSection(sections: SectionRange[], heading: string): SectionRange | null {
  const t = heading.trim();
  for (const s of sections) {
    if (s.heading === t) return s;
  }
  return null;
}

function splitContentLines(content: string): string[] {
  if (content === "") return [];
  return content.split("\n");
}

function applyOp(body: string, op: PatchOp): string {
  const { lines, sections } = parseSections(body);
  const found = findSection(sections, op.section);

  if (op.kind === "replace-section") {
    if (!found) {
      throw new Error(`replace-section: section ${JSON.stringify(op.section)} not found in body`);
    }
    const before = lines.slice(0, found.startLine);
    const after = lines.slice(found.endLine);
    const replacement = [op.section.trim(), ...splitContentLines(op.content)];
    return [...before, ...replacement, ...after].join("\n");
  }

  if (op.kind === "append-section") {
    const insertion = splitContentLines(op.content);
    if (!found) {
      const trailing = body.length === 0 || body.endsWith("\n") ? "" : "\n";
      const sep = body.length === 0 ? "" : "\n";
      const newBlock = [op.section.trim(), ...insertion].join("\n");
      return body + trailing + sep + newBlock;
    }
    const before = lines.slice(0, found.endLine);
    const after = lines.slice(found.endLine);
    return [...before, ...insertion, ...after].join("\n");
  }

  throw new Error(`unknown patch kind: ${(op as { kind: string }).kind}`);
}

export function applyPatch(body: string, patch: Patch): string {
  let current = body;
  for (const op of patch) {
    current = applyOp(current, op);
  }
  return current;
}
