import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { archiveDestinationHint, projectIdFromRoot } from "../agentSurface/layoutHints.js";
import type { Config } from "../config.js";
import { parseFrontmatter } from "../frontmatter.js";
import { createProposal, findDuplicate } from "../inbox/create.js";
import { indexPath } from "../paths.js";
import type { NodeType } from "../types.js";
import { type NodeFile, listNodeFiles } from "../vault.js";

const MS_PER_DAY = 86_400_000;

const VERIFIED_STATUSES = new Set([
  "stable",
  "verified",
  "done",
  "implemented",
  "completed",
  "shipped",
]);

const ARCHIVED_STATUSES = new Set(["archived", "removed", "abandoned"]);

const ELIGIBLE_TYPES: NodeType[] = [
  "goal",
  "intent",
  "spec",
  "decision",
  "plan",
  "task",
  "insight",
  "question",
];

const DEFAULT_AGE_DAYS = 180;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

export interface ArchiveProposerOptions {
  /** Minimum age (in days) before a node becomes an archive candidate. Default 180. */
  ageDays?: number;
  /** Confidence below which (and undefined) a node is treated as low-confidence. Default 0.5. */
  confidenceThreshold?: number;
  /** Override clock for deterministic tests. */
  now?: Date;
}

export interface ArchiveCandidate {
  nodeType: NodeType;
  nodeId: string;
  ageDays: number;
  confidence: number | undefined;
  status: string;
  triggers: string[];
  proposalId?: string;
  skipped?: "duplicate" | "active" | "verified" | "archived" | "fresh" | "high-confidence";
}

export interface ArchiveProposerResult {
  proposalsCreated: number;
  candidates: ArchiveCandidate[];
}

interface IndexFrontmatter {
  active_goal?: string;
  active_spec?: string;
  active_plan?: string;
  current_task?: string;
}

async function readActiveSet(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return out;
  try {
    const raw = await readFile(path, "utf8");
    const { data } = parseFrontmatter<IndexFrontmatter>(raw);
    for (const v of [data.active_goal, data.active_spec, data.active_plan, data.current_task]) {
      if (typeof v === "string" && v.length > 0) out.add(v);
    }
  } catch {
    // index unreadable — treat as no active references
  }
  return out;
}

function ageOf(node: NodeFile, now: Date): number {
  const updated = String(node.frontmatter.updated ?? node.frontmatter.created ?? "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(updated)) return Number.POSITIVE_INFINITY;
  const d = new Date(updated);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return (now.getTime() - d.getTime()) / MS_PER_DAY;
}

function readConfidence(node: NodeFile): number | undefined {
  const prov = node.frontmatter.provenance;
  if (typeof prov !== "object" || prov === null) return undefined;
  const c = (prov as Record<string, unknown>).confidence;
  if (typeof c === "number" && Number.isFinite(c)) return c;
  return undefined;
}

function isVerified(node: NodeFile): boolean {
  const status = String(node.frontmatter.status ?? "");
  if (VERIFIED_STATUSES.has(status)) return true;
  const prov = node.frontmatter.provenance;
  if (typeof prov === "object" && prov !== null) {
    if ((prov as Record<string, unknown>).verified === true) return true;
  }
  if (node.frontmatter.verified_by !== undefined) return true;
  return false;
}

function buildArchiveBody(
  target: string,
  ageDays: number,
  confidence: number | undefined,
  status: string,
  projectId: string,
): string {
  const lines: string[] = [];
  lines.push(`> Auto-drafted archive proposal for **${target}**.`);
  lines.push("");
  lines.push("## Triggers");
  lines.push(`- age: ${Math.round(ageDays)} days since last update (threshold: 180)`);
  lines.push(
    `- confidence: ${confidence === undefined ? "missing" : confidence.toFixed(2)} (threshold: < 0.5 or missing)`,
  );
  lines.push(`- unverified: status=${status || "(empty)"} not in verified set`);
  lines.push("");
  lines.push("## What happens on accept");
  lines.push("- frontmatter `status` flips to `archived`");
  lines.push(`- watcher moves the file under \`${archiveDestinationHint(projectId)}\``);
  lines.push("");
  lines.push(
    "_Reject if this node is still authoritative — the proposer will not re-suggest the same body._",
  );
  return lines.join("\n");
}

export async function proposeStaleNodeArchives(
  repoRoot: string,
  cfg: Config,
  opts: ArchiveProposerOptions = {},
): Promise<ArchiveProposerResult> {
  const ageDays = opts.ageDays ?? DEFAULT_AGE_DAYS;
  const confidenceThreshold = opts.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const now = opts.now ?? new Date();
  const activeSet = await readActiveSet(repoRoot);
  const projectId = projectIdFromRoot(repoRoot);

  const result: ArchiveProposerResult = { proposalsCreated: 0, candidates: [] };

  for (const nodeType of ELIGIBLE_TYPES) {
    const nodes = await listNodeFiles(repoRoot, cfg, nodeType);
    for (const node of nodes) {
      const status = String(node.frontmatter.status ?? "");
      const confidence = readConfidence(node);
      const age = ageOf(node, now);
      const candidate: ArchiveCandidate = {
        nodeType,
        nodeId: node.id,
        ageDays: age,
        confidence,
        status,
        triggers: [],
      };

      if (ARCHIVED_STATUSES.has(status)) {
        candidate.skipped = "archived";
        result.candidates.push(candidate);
        continue;
      }
      if (activeSet.has(node.id)) {
        candidate.skipped = "active";
        result.candidates.push(candidate);
        continue;
      }
      if (age < ageDays) {
        candidate.skipped = "fresh";
        result.candidates.push(candidate);
        continue;
      }
      if (isVerified(node)) {
        candidate.skipped = "verified";
        result.candidates.push(candidate);
        continue;
      }
      if (confidence !== undefined && confidence >= confidenceThreshold) {
        candidate.skipped = "high-confidence";
        result.candidates.push(candidate);
        continue;
      }

      candidate.triggers = [
        `age>=${ageDays}d`,
        confidence === undefined ? "no-confidence" : `confidence<${confidenceThreshold}`,
        "unverified",
      ];

      const newBody = buildArchiveBody(node.id, age, confidence, status, projectId);
      const dup = await findDuplicate(repoRoot, cfg, {
        proposalType: "update",
        targetType: nodeType,
        target: node.id,
        newBody,
      });
      if (dup) {
        candidate.skipped = "duplicate";
        result.candidates.push(candidate);
        continue;
      }

      const proposal = await createProposal(repoRoot, cfg, {
        proposalType: "update",
        targetType: nodeType,
        target: node.id,
        newBody,
        newFrontmatter: { status: "archived" },
        summary: `Archive ${node.id} (stale draft, low confidence, unverified)`,
        reason: `Age ${Math.round(age)}d ≥ ${ageDays}d; confidence ${
          confidence === undefined ? "missing" : confidence.toFixed(2)
        } < ${confidenceThreshold}; status='${status}' unverified.`,
        provenance: {
          createdBy: "cairndex-archive-proposer",
          session: now.toISOString().slice(0, 10),
          confidence: 0.5,
        },
      });
      candidate.proposalId = proposal.proposalId;
      result.proposalsCreated += 1;
      result.candidates.push(candidate);
    }
  }

  return result;
}
