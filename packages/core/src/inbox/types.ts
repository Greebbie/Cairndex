import type { NodeType } from "../types.js";

export type ProposalType = "create" | "update";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "duplicate";

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
  /** Replaces the target node's body (update) or becomes the new node body (create). */
  newBody: string;
  /** One-line summary shown in the inbox UI. */
  summary: string;
  /** Why the proposal was made — agent reasoning. */
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
  rejectedAt?: string;
  rejectionReason?: string;
  provenance: ProposalProvenance;
  newBody: string;
  newFrontmatter?: Record<string, unknown>;
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
