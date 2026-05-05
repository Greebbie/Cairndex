import { existsSync } from "node:fs";
import {
  type AcceptResult,
  type NodeType,
  type Patch,
  type ProposalList,
  type ProposalType,
  acceptProposal,
  createProposal,
  defaultConfig,
  findDuplicate,
  inferNodeTypeFromId,
  listProposals,
  loadProjectConfig,
  rejectProposal,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

interface BaseOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

function loadCfg(root: string) {
  return existsSync(`${vaultPath(root)}/config.yaml`) ? loadProjectConfig(root) : defaultConfig();
}

export interface InboxProposeOptions extends BaseOptions {
  proposalType: ProposalType;
  targetType: NodeType;
  target?: string;
  newBody: string;
  newFrontmatter?: Record<string, unknown>;
  summary: string;
  reason: string;
  createdBy: string;
  session: string;
  confidence?: number;
}

export interface InboxProposeUpdateOptions extends BaseOptions {
  /** Existing node id, e.g. SPEC-001. targetType is inferred from the prefix. */
  targetId: string;
  /** Section heading. Accepts "## History" or "History" (the latter defaults to level 2). */
  section: string;
  /** Markdown content for the patch op. */
  newContent: string;
  /** "replace" rewrites the section body; "append" inserts at end of section (or at end of body if missing). */
  mode: "replace" | "append";
  summary: string;
  reason: string;
  createdBy: string;
  session: string;
  confidence?: number;
}

function normalizeSectionHeading(raw: string): string {
  const trimmed = raw.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return trimmed;
  return `## ${trimmed}`;
}

export interface InboxProposeResult {
  exitCode: 0 | 1;
  proposalId?: string;
  path?: string;
  duplicateOf?: string;
  message?: string;
}

export async function runInboxPropose(opts: InboxProposeOptions): Promise<InboxProposeResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }
  const cfg = loadCfg(root);
  const dupInput: Parameters<typeof findDuplicate>[2] = {
    proposalType: opts.proposalType,
    targetType: opts.targetType,
    newBody: opts.newBody,
  };
  if (opts.target !== undefined) dupInput.target = opts.target;
  const duplicateOf = await findDuplicate(root, cfg, dupInput);

  const createInput: Parameters<typeof createProposal>[2] = {
    proposalType: opts.proposalType,
    targetType: opts.targetType,
    newBody: opts.newBody,
    summary: opts.summary,
    reason: opts.reason,
    provenance: {
      createdBy: opts.createdBy,
      session: opts.session,
      ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
    },
  };
  if (opts.target !== undefined) createInput.target = opts.target;
  if (opts.newFrontmatter !== undefined) createInput.newFrontmatter = opts.newFrontmatter;
  const created = await createProposal(root, cfg, createInput);

  const result: InboxProposeResult = {
    exitCode: 0,
    proposalId: created.proposalId,
    path: created.path,
  };
  if (duplicateOf) result.duplicateOf = duplicateOf;
  return result;
}

export interface InboxProposeUpdateResult {
  exitCode: 0 | 1;
  proposalId?: string;
  path?: string;
  targetType?: NodeType;
  targetId?: string;
  section?: string;
  mode?: "replace" | "append";
  message?: string;
}

/**
 * High-level "patch one section" helper. Auto-infers targetType from the id prefix
 * and submits a single-op patch proposal. Use runInboxPropose for full-body or
 * create-mode proposals.
 */
export async function runInboxProposeUpdate(
  opts: InboxProposeUpdateOptions,
): Promise<InboxProposeUpdateResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const targetType = inferNodeTypeFromId(opts.targetId);
  if (!targetType) {
    return {
      exitCode: 1,
      message: `cannot infer node type from id "${opts.targetId}" — expected a sequential id like SPEC-001 or ADR-042`,
    };
  }
  const cfg = loadCfg(root);
  const section = normalizeSectionHeading(opts.section);
  const patch: Patch = [
    {
      kind: opts.mode === "append" ? "append-section" : "replace-section",
      section,
      content: opts.newContent,
    },
  ];

  const createInput: Parameters<typeof createProposal>[2] = {
    proposalType: "update",
    targetType,
    target: opts.targetId,
    patch,
    summary: opts.summary,
    reason: opts.reason,
    provenance: {
      createdBy: opts.createdBy,
      session: opts.session,
      ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}),
    },
  };

  try {
    const created = await createProposal(root, cfg, createInput);
    return {
      exitCode: 0,
      proposalId: created.proposalId,
      path: created.path,
      targetType,
      targetId: opts.targetId,
      section,
      mode: opts.mode,
    };
  } catch (e) {
    return { exitCode: 1, message: e instanceof Error ? e.message : String(e) };
  }
}

export interface InboxListResult {
  exitCode: 0 | 1;
  list?: ProposalList;
  message?: string;
}

export async function runInboxList(opts: BaseOptions): Promise<InboxListResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }
  const cfg = loadCfg(root);
  const list = await listProposals(root, cfg);
  return { exitCode: 0, list };
}

export interface InboxAcceptOptions extends BaseOptions {
  proposalId: string;
}

export interface InboxAcceptResult {
  exitCode: 0 | 1;
  applied?: AcceptResult;
  message?: string;
}

export async function runInboxAccept(opts: InboxAcceptOptions): Promise<InboxAcceptResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }
  const cfg = loadCfg(root);
  try {
    const applied = await acceptProposal(root, cfg, opts.proposalId);
    return { exitCode: 0, applied };
  } catch (e) {
    return {
      exitCode: 1,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface InboxRejectOptions extends BaseOptions {
  proposalId: string;
  reason: string;
}

export async function runInboxReject(
  opts: InboxRejectOptions,
): Promise<{ exitCode: 0 | 1; message?: string }> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
    };
  }
  const cfg = loadCfg(root);
  try {
    await rejectProposal(root, cfg, opts.proposalId, opts.reason);
    return { exitCode: 0 };
  } catch (e) {
    return { exitCode: 1, message: e instanceof Error ? e.message : String(e) };
  }
}

export interface InboxCleanupOptions extends BaseOptions {
  /** Match proposals whose `provenance.created_by` equals this string. */
  autoSource: string;
  reason?: string;
  dryRun?: boolean;
}

export interface InboxCleanupResult {
  exitCode: 0 | 1;
  message?: string;
  matched: Array<{ proposalId: string; summary: string }>;
  rejected: string[];
  skipped: Array<{ proposalId: string; reason: string }>;
}

export async function runInboxCleanup(opts: InboxCleanupOptions): Promise<InboxCleanupResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: missingVaultMessage(root),
      matched: [],
      rejected: [],
      skipped: [],
    };
  }
  const cfg = loadCfg(root);
  const list = await listProposals(root, cfg);
  // Only pending proposals are candidates — already-rejected ones have nothing
  // to do, accepted/duplicate ones shouldn't be silently re-touched.
  const matched: Array<{ proposalId: string; summary: string }> = [];
  for (const p of list.pending) {
    if (p.provenance.createdBy === opts.autoSource) {
      matched.push({ proposalId: p.proposalId, summary: p.summary });
    }
  }
  if (opts.dryRun) {
    return { exitCode: 0, matched, rejected: [], skipped: [] };
  }
  const reason = opts.reason ?? `bulk cleanup: created_by=${opts.autoSource}`;
  const rejected: string[] = [];
  const skipped: Array<{ proposalId: string; reason: string }> = [];
  for (const m of matched) {
    try {
      await rejectProposal(root, cfg, m.proposalId, reason);
      rejected.push(m.proposalId);
    } catch (e) {
      skipped.push({
        proposalId: m.proposalId,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { exitCode: 0, matched, rejected, skipped };
}
