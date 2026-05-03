import type { NodeType } from "../types.js";

export type ProposalType = "create" | "update";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "duplicate";

export type PatchOpKind = "append-section" | "replace-section";

export interface PatchOp {
  kind: PatchOpKind;
  section: string;
  content: string;
}

export type Patch = PatchOp[];

export interface ProposalProvenance {
  createdBy: string;
  session: string;
  confidence?: number;
}

export interface CreateProposalInput {
  proposalType: ProposalType;
  targetType: NodeType;
  /** Required when proposalType === 'update'. */
  target?: string;
  /** Required when proposalType === 'create' — must include at least `title` and `status`. */
  newFrontmatter?: Record<string, unknown>;
  /** Exactly one of newBody / patch must be supplied. */
  newBody?: string;
  /** Section-level edits. Only valid on update proposals; mutually exclusive with newBody. */
  patch?: Patch;
  summary: string;
  reason: string;
  provenance: ProposalProvenance;
}

export interface FindDuplicateInput {
  proposalType: ProposalType;
  targetType: NodeType;
  target?: string;
  newBody: string;
}

export interface ProposalFile {
  proposalId: string;
  path: string;
  proposalType: ProposalType;
  targetType: NodeType;
  target?: string;
  status: ProposalStatus;
  summary: string;
  reason: string;
  contentHash: string;
  createdAt: string;
  duplicateOf?: string;
  acceptedAt?: string;
  /** "user" for manual review accept; "auto" when the auto-accept gate fired. */
  acceptedBy?: "user" | "auto";
  /** ID of the durable target the accept created/updated. */
  acceptedTarget?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  provenance: ProposalProvenance;
  newBody: string;
  newFrontmatter?: Record<string, unknown>;
  patch?: Patch;
}

export interface ProposalList {
  pending: ProposalFile[];
  accepted: ProposalFile[];
  rejected: ProposalFile[];
  duplicate: ProposalFile[];
}

export interface AcceptResult {
  proposalId: string;
  targetId: string;
  targetPath: string;
  action: "updated" | "created";
}
