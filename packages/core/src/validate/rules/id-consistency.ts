import { basename } from "node:path";
import type { ValidationIssue, ValidationRule } from "../types.js";

export const idConsistency: ValidationRule = {
  name: "id-consistency",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const fname = basename(node.path).replace(/\.md$/, "");
      // Filename starts with the ID, then optional "-slug".
      const fmId = String(node.frontmatter.id ?? "");
      if (!fmId) continue; // schema-required will flag.
      if (!fname.startsWith(fmId)) {
        issues.push({
          rule: "id-consistency",
          severity: "error" as const,
          message: `filename ${fname} does not start with frontmatter id ${fmId}`,
          nodeType: node.type,
          nodeId: fmId,
          path: node.path,
          fixable: true,
        });
      }
    }
    return issues;
  },
};
