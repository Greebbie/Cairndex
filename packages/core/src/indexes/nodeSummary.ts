import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Config } from "../config.js";
import { nodeSummaryPath } from "../paths.js";
import { NODE_TYPES, type NodeType } from "../types.js";
import { listNodeFiles, type NodeFile } from "../vault.js";

export interface NodeSummaryEntry {
  id: string;
  type: NodeType;
  title: string;
  status: string;
  confidence: number | null;
  lastVerified: string | null;
  freshnessDays: number | null;
}

export interface NodeSummary {
  generatedAt: string;
  nodes: NodeSummaryEntry[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function freshnessDays(updated: string | undefined, now: Date): number | null {
  if (!updated) return null;
  const parsed = new Date(updated);
  if (Number.isNaN(parsed.getTime())) return null;
  const diff = now.getTime() - parsed.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

function summarize(node: NodeFile, now: Date): NodeSummaryEntry {
  const fm = node.frontmatter;
  const provenance = (fm.provenance ?? {}) as Record<string, unknown>;
  const updated = (fm.updated ?? fm.created) as string | undefined;
  const confidenceRaw = provenance.confidence;
  const lastVerifiedRaw = provenance.last_verified;
  return {
    id: node.id,
    type: node.type,
    title: String(fm.title ?? node.id),
    status: String(fm.status ?? ""),
    confidence: typeof confidenceRaw === "number" ? confidenceRaw : null,
    lastVerified:
      typeof lastVerifiedRaw === "string" || typeof lastVerifiedRaw === "number"
        ? String(lastVerifiedRaw)
        : null,
    freshnessDays: freshnessDays(typeof updated === "string" ? updated : undefined, now),
  };
}

export async function buildNodeSummary(repoRoot: string, cfg: Config): Promise<NodeSummary> {
  const now = new Date();
  const entries: NodeSummaryEntry[] = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) entries.push(summarize(f, now));
  }
  return { generatedAt: now.toISOString(), nodes: entries };
}

export interface RegenerateNodeSummaryResult {
  path: string;
  summary: NodeSummary;
  changed: boolean;
}

interface CompareableSummary {
  nodes: NodeSummary["nodes"];
}

function withoutGeneratedAt(s: NodeSummary): CompareableSummary {
  return { nodes: s.nodes };
}

export async function regenerateNodeSummary(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateNodeSummaryResult> {
  const summary = await buildNodeSummary(repoRoot, cfg);
  const path = nodeSummaryPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  let changed = true;
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8")) as NodeSummary;
      changed =
        JSON.stringify(withoutGeneratedAt(prev)) !== JSON.stringify(withoutGeneratedAt(summary));
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  return { path, summary, changed };
}
