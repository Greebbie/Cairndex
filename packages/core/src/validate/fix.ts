import { readFile, writeFile } from "node:fs/promises";
import type { Config } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { normalizeFrontmatter, normalizeTags } from "../normalize.js";
import type { ValidationIssue } from "./types.js";

interface LinkLike {
  type: string;
  target: string;
}

export interface FixResult {
  fixed: ValidationIssue[];
  unfixed: ValidationIssue[];
}

async function rewriteFile(
  path: string,
  fn: (fm: Record<string, unknown>, body: string) => Record<string, unknown>,
): Promise<void> {
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next = fn(data, content);
  await writeFile(path, serializeFrontmatter(next, content), "utf8");
}

export async function applyAutoFixes(
  repoRoot: string,
  cfg: Config,
  issues: readonly ValidationIssue[],
): Promise<FixResult> {
  const fixed: ValidationIssue[] = [];
  const unfixed: ValidationIssue[] = [];

  // Group "in-place" fixable issues by source path (tag-format, future ones).
  const byPath = new Map<string, ValidationIssue[]>();
  for (const i of issues) {
    if (!i.fixable || !i.path) {
      unfixed.push(i);
      continue;
    }
    if (i.rule === "bidirectional" || i.rule === "id-consistency") {
      // Handled separately below — do not group here.
      continue;
    }
    const list = byPath.get(i.path) ?? [];
    list.push(i);
    byPath.set(i.path, list);
  }

  for (const [path, list] of byPath) {
    try {
      await rewriteFile(path, (fm) => {
        const next: Record<string, unknown> = { ...fm };
        for (const i of list) {
          if (i.rule === "tag-format") {
            next.tags = normalizeTags(next.tags);
          }
        }
        return normalizeFrontmatter(next, { refreshTimestamp: true });
      });
      for (const i of list) fixed.push(i);
    } catch {
      for (const i of list) unfixed.push(i);
    }
  }

  // Handle bidirectional separately: write the reciprocal on the target file.
  for (const i of issues) {
    if (i.rule !== "bidirectional" || !i.fixable) continue;

    let targetId: string | undefined;
    let reciprocal: string | undefined;
    let sourceId: string | undefined;

    if (i.meta?.targetId && i.meta?.reciprocal && i.meta?.sourceId) {
      // Preferred: read from structured metadata.
      targetId = i.meta.targetId;
      reciprocal = i.meta.reciprocal;
      sourceId = i.meta.sourceId;
    } else {
      // Fallback: parse human-readable message (backward compat, deprecated).
      console.warn(
        "bidirectional fix: falling back to regex parsing — attach meta to ValidationIssue",
      );
      const m = /^(.+?)\.(\w+) -> (.+?), but (.+?)\.(\w+) -> (.+?) is missing$/.exec(i.message);
      if (!m) {
        unfixed.push(i);
        continue;
      }
      [, , , , targetId, reciprocal, sourceId] = m;
    }

    if (!targetId || !reciprocal || !sourceId) {
      unfixed.push(i);
      continue;
    }
    try {
      const targetPath = await findFileByFrontmatterId(repoRoot, cfg, targetId);
      if (!targetPath) {
        unfixed.push(i);
        continue;
      }
      await rewriteFile(targetPath, (fm) => {
        const links = (Array.isArray(fm.links) ? fm.links : []) as LinkLike[];
        const exists = links.some((l) => l.type === reciprocal && l.target === sourceId);
        if (!exists) links.push({ type: reciprocal, target: sourceId });
        return { ...fm, links };
      });
      fixed.push(i);
    } catch {
      unfixed.push(i);
    }
  }

  // id-consistency: leave to manual fix (file rename is risky in auto mode).
  for (const i of issues) {
    if (i.rule === "id-consistency" && i.fixable) unfixed.push(i);
  }

  return { fixed, unfixed };
}

async function findFileByFrontmatterId(
  repoRoot: string,
  cfg: Config,
  id: string,
): Promise<string | null> {
  const { listNodeFiles } = await import("../vault.js");
  const { NODE_TYPES } = await import("../types.js");
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) if (f.id === id) return f.path;
  }
  return null;
}
