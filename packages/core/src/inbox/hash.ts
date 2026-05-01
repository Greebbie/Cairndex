import { createHash } from "node:crypto";
import type { FindDuplicateInput } from "./types.js";

/**
 * Compute a stable content hash for dedupe. Includes the (type, target, body)
 * tuple so that two agents proposing the same body to the same node will collide.
 */
export function computeProposalHash(input: FindDuplicateInput): string {
  const payload = [
    input.proposalType,
    input.targetType,
    input.target ?? "",
    // Normalize whitespace so trailing-newline differences don't desynchronize.
    input.newBody.trim(),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
