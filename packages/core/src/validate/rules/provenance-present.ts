import type { ValidationIssue, ValidationRule } from "../types.js";

export const provenancePresent: ValidationRule = {
  name: "provenance-present",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const p = node.frontmatter.provenance as
        | { created_by?: unknown; session?: unknown }
        | undefined;
      if (!p || !p.created_by || !p.session) {
        issues.push({
          rule: "provenance-present",
          severity: "warn" as const,
          message: `${node.id} has incomplete or missing provenance (need created_by and session)`,
          nodeType: node.type,
          nodeId: node.id,
          path: node.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
