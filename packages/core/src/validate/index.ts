import type { Config } from "../config.js";
import { NODE_TYPES } from "../types.js";
import { listNodeFiles } from "../vault.js";
import { bidirectional } from "./rules/bidirectional.js";
import { confidenceLow } from "./rules/confidence-low.js";
import { freshness } from "./rules/freshness.js";
import { idCollision } from "./rules/id-collision.js";
import { idConsistency } from "./rules/id-consistency.js";
import { phaseCoherence } from "./rules/phase-coherence.js";
import { provenancePresent } from "./rules/provenance-present.js";
import { referenceIntegrity } from "./rules/reference-integrity.js";
import { schemaRequired } from "./rules/schema-required.js";
import { tagFormat } from "./rules/tag-format.js";
import { unknownFolder } from "./rules/unknown-folder.js";
import { verificationBound } from "./rules/verification-bound.js";
import type { ValidationContext, ValidationIssue, ValidationRule } from "./types.js";

const RULES: ValidationRule[] = [
  schemaRequired,
  idConsistency,
  referenceIntegrity,
  verificationBound,
  bidirectional,
  idCollision,
  provenancePresent,
  freshness,
  tagFormat,
  phaseCoherence,
  unknownFolder,
  confidenceLow,
];

export interface RunValidationOptions {
  rules?: readonly ValidationRule[];
}

export async function runValidation(
  repoRoot: string,
  cfg: Config,
  opts: RunValidationOptions = {},
): Promise<ValidationIssue[]> {
  const allNodes: Array<ValidationContext["allNodes"][number]> = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) allNodes.push({ ...f });
  }
  const ctx: ValidationContext = { repoRoot, allNodes };
  const out: ValidationIssue[] = [];
  const rules = opts.rules ?? RULES;
  for (const r of rules) out.push(...r.run(ctx));
  return out;
}

export type { ValidationIssue, ValidationRule, Severity, ValidationContext } from "./types.js";
