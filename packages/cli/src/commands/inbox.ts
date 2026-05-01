import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  acceptProposal,
  type AcceptResult,
  createProposal,
  defaultConfig,
  findDuplicate,
  listProposals,
  loadProjectConfig,
  type NodeType,
  type ProposalList,
  type ProposalType,
  rejectProposal,
  vaultExists,
  vaultPath,
} from "@cairndex/core";

interface BaseOptions {
  cwd: string;
  vaultRoot?: string;
}

function resolveVaultRoot(opts: BaseOptions): string {
  return opts.vaultRoot ? resolve(opts.vaultRoot) : resolve(opts.cwd);
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

export interface InboxProposeResult {
  exitCode: 0 | 1;
  proposalId?: string;
  path?: string;
  duplicateOf?: string;
  message?: string;
}

export async function runInboxPropose(opts: InboxProposeOptions): Promise<InboxProposeResult> {
  const root = resolveVaultRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
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

export interface InboxListResult {
  exitCode: 0 | 1;
  list?: ProposalList;
  message?: string;
}

export async function runInboxList(opts: BaseOptions): Promise<InboxListResult> {
  const root = resolveVaultRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
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
  const root = resolveVaultRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
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
  const root = resolveVaultRoot(opts);
  if (!vaultExists(root)) {
    return {
      exitCode: 1,
      message: `no .cairndex/ vault found at ${vaultPath(root)} (run \`cairndex init\` first)`,
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
