import type { ValidationIssue, ValidationRule } from "../types.js";

interface LinkLike {
  type: string;
  target: string;
}

export const referenceIntegrity: ValidationRule = {
  name: "reference-integrity",
  run(ctx) {
    const allIds = new Set(ctx.allNodes.map((n) => n.id));
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        if (!link?.target) continue;
        if (!allIds.has(link.target)) {
          issues.push({
            rule: "reference-integrity",
            severity: "error" as const,
            message: `${node.id} link.${link.type} references unknown id: ${link.target}`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: false,
          });
        }
      }
    }
    return issues;
  },
};
