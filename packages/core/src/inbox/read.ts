import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseFrontmatter } from "../frontmatter.js";
import { inboxProposalsPath } from "../paths.js";
import type { NodeType } from "../types.js";
import type {
  Patch,
  PatchOp,
  ProposalFile,
  ProposalList,
  ProposalStatus,
  ProposalType,
} from "./types.js";

interface RawProposalFrontmatter {
  id?: string;
  proposalType?: string;
  targetType?: string;
  target?: string;
  status?: string;
  summary?: string;
  reason?: string;
  contentHash?: string;
  created?: string;
  duplicateOf?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  acceptedTarget?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  provenance?: {
    created_by?: string;
    session?: string;
    confidence?: number;
  };
  newFrontmatter?: Record<string, unknown>;
  patch?: unknown;
}

function asProposalType(s: unknown): ProposalType | null {
  if (s === "create" || s === "update") return s;
  return null;
}
function asStatus(s: unknown): ProposalStatus {
  if (s === "accepted" || s === "rejected" || s === "duplicate") return s;
  return "pending";
}
function asNodeType(s: unknown): NodeType | null {
  const known: NodeType[] = [
    "goal",
    "intent",
    "spec",
    "decision",
    "plan",
    "task",
    "session",
    "change",
    "insight",
    "question",
  ];
  return typeof s === "string" && (known as string[]).includes(s) ? (s as NodeType) : null;
}

function asPatch(raw: unknown): Patch | null {
  if (!Array.isArray(raw)) return null;
  const ops: PatchOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (o.kind !== "append-section" && o.kind !== "replace-section") return null;
    if (typeof o.section !== "string") return null;
    if (typeof o.content !== "string") return null;
    ops.push({ kind: o.kind, section: o.section, content: o.content });
  }
  return ops;
}

export async function readProposal(path: string): Promise<ProposalFile | null> {
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<RawProposalFrontmatter>(raw);
  const proposalType = asProposalType(data.proposalType);
  const targetType = asNodeType(data.targetType);
  if (!proposalType || !targetType) return null;
  const fileBase = basename(path).replace(/\.md$/, "");
  const proposalId = String(data.id ?? fileBase);

  const file: ProposalFile = {
    proposalId,
    path,
    proposalType,
    targetType,
    status: asStatus(data.status),
    summary: String(data.summary ?? ""),
    reason: String(data.reason ?? ""),
    contentHash: String(data.contentHash ?? ""),
    createdAt: String(data.created ?? ""),
    provenance: {
      createdBy: String(data.provenance?.created_by ?? ""),
      session: String(data.provenance?.session ?? ""),
      ...(typeof data.provenance?.confidence === "number"
        ? { confidence: data.provenance.confidence }
        : {}),
    },
    newBody: content,
  };
  if (data.target !== undefined) file.target = data.target;
  if (data.duplicateOf !== undefined) file.duplicateOf = data.duplicateOf;
  if (data.acceptedAt !== undefined) file.acceptedAt = data.acceptedAt;
  if (data.acceptedBy === "user" || data.acceptedBy === "auto") {
    file.acceptedBy = data.acceptedBy;
  }
  if (data.acceptedTarget !== undefined) file.acceptedTarget = data.acceptedTarget;
  if (data.rejectedAt !== undefined) file.rejectedAt = data.rejectedAt;
  if (data.rejectionReason !== undefined) file.rejectionReason = data.rejectionReason;
  if (data.newFrontmatter !== undefined && typeof data.newFrontmatter === "object") {
    file.newFrontmatter = data.newFrontmatter;
  }
  if (data.patch !== undefined) {
    const parsed = asPatch(data.patch);
    if (parsed && parsed.length > 0) file.patch = parsed;
  }
  return file;
}

export async function listProposals(repoRoot: string, _cfg: unknown): Promise<ProposalList> {
  const dir = inboxProposalsPath(repoRoot);
  const out: ProposalList = { pending: [], accepted: [], rejected: [], duplicate: [] };
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir);
  for (const e of entries) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    const file = await readProposal(join(dir, e));
    if (!file) continue;
    out[file.status].push(file);
  }
  // Newest first by id (PROP-NNN sort) within each bucket.
  const sortByIdDesc = (a: ProposalFile, b: ProposalFile) =>
    a.proposalId < b.proposalId ? 1 : a.proposalId > b.proposalId ? -1 : 0;
  out.pending.sort(sortByIdDesc);
  out.accepted.sort(sortByIdDesc);
  out.rejected.sort(sortByIdDesc);
  out.duplicate.sort(sortByIdDesc);
  return out;
}
