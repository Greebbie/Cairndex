import type { Config } from "../config.js";
import { readUserPreferences } from "../userPrefs.js";
import { acceptProposal } from "./accept.js";
import { createProposal, type CreateProposalResult } from "./create.js";
import type { AcceptResult, CreateProposalInput } from "./types.js";

/**
 * Result of `createWithAutoAccept`. Always includes the proposal-creation result;
 * `autoAccepted: true` flips the proposal straight to `accepted` status with
 * `applied` populated to the durable target's path.
 */
export interface AutoAcceptResult extends CreateProposalResult {
  autoAccepted: boolean;
  /** Populated when `autoAccepted` is true — the result of the immediate accept. */
  applied?: AcceptResult;
  /** The threshold that gated the decision, surfaced for telemetry / logging. */
  thresholdAtDecision: number | null;
}

/**
 * Create a proposal, then immediately accept it if it clears the user's
 * `autoAcceptConfidenceThreshold` preference. This is the single wired entry
 * point for "agent proposes a memory update" — every code path that reaches
 * `createProposal` for an agent-driven write should go through here so the
 * threshold gate is consistently applied.
 *
 * Wiring rules:
 *   - When `autoAcceptConfidenceThreshold` is null (default), behavior is
 *     identical to plain `createProposal` — the proposal lands in pending and
 *     waits for manual review. No regression for users who never set the pref.
 *   - When the pref is set AND `input.provenance.confidence` is a number AND
 *     it is >= threshold, `acceptProposal` runs immediately with
 *     `acceptedBy: "auto"`. The changelog and proposal frontmatter both record
 *     the auto-accept so the timeline distinguishes machine vs human approvals.
 *   - When the proposal has no numeric confidence (e.g. a manually-submitted
 *     PROP via `cairndex inbox propose`), the gate never fires regardless of
 *     threshold — manual submissions always go through manual review.
 *
 * Errors during the accept stage do NOT roll back proposal creation. The
 * proposal still exists in `inbox/proposed-memory-updates/` and the user can
 * accept it manually — better than losing the proposal and silently failing.
 */
export async function createWithAutoAccept(
  repoRoot: string,
  cfg: Config,
  input: CreateProposalInput,
): Promise<AutoAcceptResult> {
  const created = await createProposal(repoRoot, cfg, input);

  const prefs = await readUserPreferences();
  const threshold = prefs.autoAcceptConfidenceThreshold;
  const conf = input.provenance.confidence;

  const eligible =
    threshold !== null && typeof conf === "number" && conf >= threshold;

  if (!eligible) {
    return { ...created, autoAccepted: false, thresholdAtDecision: threshold };
  }

  try {
    const applied = await acceptProposal(repoRoot, cfg, created.proposalId, {
      acceptedBy: "auto",
    });
    return {
      ...created,
      autoAccepted: true,
      applied,
      thresholdAtDecision: threshold,
    };
  } catch (err) {
    // Acceptance failed (e.g. immutable type, missing target). The proposal
    // file is intact — surface autoAccepted: false and let the human review.
    // We log the error rather than swallow silently so the user can diagnose
    // why an "expected to auto-accept" proposal landed in pending.
    console.warn(
      `[cairndex] auto-accept skipped for ${created.proposalId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ...created, autoAccepted: false, thresholdAtDecision: threshold };
  }
}
