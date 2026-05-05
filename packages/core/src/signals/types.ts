import type { NodeType } from "../types.js";

/**
 * Which automated process emitted this signal file.
 *   - "auto-distill"     — heuristic session distillation (Stop hook)
 *   - "auto-consolidate" — multi-session consolidation (Task 1.5, future)
 */
export type SignalSource = "auto-distill" | "auto-consolidate";

/**
 * Frontmatter shape written to `signals/SIG-NNN.md` files.
 *
 * Signals are low-trust, pre-review outputs from automated heuristics. They are
 * NOT inbox proposals: they have no proposal lifecycle (no status / proposalType)
 * and are never auto-accepted. A future `cairndex signal promote` command will
 * turn a selected signal into an inbox proposal draft for human review.
 *
 * Fields retained from the old proposal shape that are still useful:
 *   - id           (now SIG-NNN, not PROP-NNN)
 *   - targetType   (what kind of node this insight is about)
 *   - summary      (one-line description)
 *   - reason       (why the heuristic fired)
 *   - contentHash  (for idempotency / duplicate detection)
 *   - created      (ISO date)
 *   - provenance   (session, confidence)
 *   - newFrontmatter (seed for future `signal promote` → inbox draft)
 *
 * Fields intentionally REMOVED vs the old PROP shape:
 *   - proposalType (inbox concept; signals don't propose)
 *   - status       (no lifecycle; signals are neither pending nor accepted)
 */
export interface SignalFrontmatter {
  id: string;
  source: SignalSource;
  targetType: NodeType;
  summary: string;
  reason: string;
  contentHash: string;
  created: string;
  provenance: {
    created_by: SignalSource;
    session: string;
    confidence?: number;
  };
  newFrontmatter?: Record<string, unknown>;
}

export interface CreateSignalInput {
  source: SignalSource;
  targetType: NodeType;
  summary: string;
  reason: string;
  newFrontmatter?: Record<string, unknown>;
  newBody: string;
  provenance: {
    session: string;
    confidence?: number;
  };
}

export interface CreateSignalResult {
  signalId: string;
  path: string;
  contentHash: string;
}
