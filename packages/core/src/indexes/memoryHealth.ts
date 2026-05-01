import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Config } from "../config.js";
import { memoryHealthPath } from "../paths.js";
import { NODE_TYPES } from "../types.js";
import { confidenceLow } from "../validate/rules/confidence-low.js";
import { freshness } from "../validate/rules/freshness.js";
import { multipleActive } from "../validate/rules/multiple-active.js";
import { provenancePresent } from "../validate/rules/provenance-present.js";
import { supersededActive } from "../validate/rules/superseded-active.js";
import { verificationBound } from "../validate/rules/verification-bound.js";
import type { Severity, ValidationIssue, ValidationRule } from "../validate/types.js";
import { listNodeFiles } from "../vault.js";

/** Rules included in Memory Health aggregation. Other rules (reference-integrity, schema-required, etc.)
 * are about structural correctness rather than memory trustworthiness, so they are not surfaced here.
 *
 * v2 adds the contradiction rules (multiple-active and superseded-active) — these surface "the vault
 * disagrees with itself" issues that the user must resolve. */
const HEALTH_RULES: ValidationRule[] = [
  freshness,
  confidenceLow,
  provenancePresent,
  verificationBound,
  multipleActive,
  supersededActive,
];

export interface MemoryHealthIssue {
  rule: string;
  severity: Severity;
  nodeId: string;
  nodeType?: string;
  message: string;
}

export interface MemoryHealthCounts {
  red: number;
  yellow: number;
  green: number;
}

export interface MemoryHealth {
  generatedAt: string;
  counts: MemoryHealthCounts;
  issues: MemoryHealthIssue[];
}

function toMemoryHealthIssue(i: ValidationIssue): MemoryHealthIssue | null {
  if (!i.nodeId) return null;
  const out: MemoryHealthIssue = {
    rule: i.rule,
    severity: i.severity,
    nodeId: i.nodeId,
    message: i.message,
  };
  if (i.nodeType !== undefined) out.nodeType = i.nodeType;
  return out;
}

export async function buildMemoryHealth(repoRoot: string, cfg: Config): Promise<MemoryHealth> {
  const allNodes: Array<{
    type: (typeof NODE_TYPES)[number];
    id: string;
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }> = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) allNodes.push({ ...f });
  }
  const ctx = { repoRoot, allNodes };
  const rawIssues: ValidationIssue[] = [];
  for (const r of HEALTH_RULES) rawIssues.push(...r.run(ctx));

  const issues: MemoryHealthIssue[] = [];
  for (const i of rawIssues) {
    const m = toMemoryHealthIssue(i);
    if (m) issues.push(m);
  }

  // Per-node classification: red if any error, yellow if any warn (no error), green otherwise.
  const byNode = new Map<string, Severity>();
  for (const i of issues) {
    const cur = byNode.get(i.nodeId);
    if (cur === "error") continue; // already worst-case red
    if (i.severity === "error") byNode.set(i.nodeId, "error");
    else if (i.severity === "warn") byNode.set(i.nodeId, "warn");
  }

  let red = 0;
  let yellow = 0;
  for (const sev of byNode.values()) {
    if (sev === "error") red += 1;
    else if (sev === "warn") yellow += 1;
  }
  const totalNodes = allNodes.length;
  const green = Math.max(0, totalNodes - red - yellow);

  return {
    generatedAt: new Date().toISOString(),
    counts: { red, yellow, green },
    issues,
  };
}

interface CompareableHealth {
  counts: MemoryHealthCounts;
  issues: MemoryHealthIssue[];
}

function withoutGeneratedAt(h: MemoryHealth): CompareableHealth {
  return { counts: h.counts, issues: h.issues };
}

export interface RegenerateMemoryHealthResult {
  path: string;
  health: MemoryHealth;
  changed: boolean;
}

export async function regenerateMemoryHealth(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateMemoryHealthResult> {
  const health = await buildMemoryHealth(repoRoot, cfg);
  const path = memoryHealthPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  let changed = true;
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8")) as MemoryHealth;
      changed =
        JSON.stringify(withoutGeneratedAt(prev)) !== JSON.stringify(withoutGeneratedAt(health));
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeFile(path, `${JSON.stringify(health, null, 2)}\n`, "utf8");
  }
  return { path, health, changed };
}
