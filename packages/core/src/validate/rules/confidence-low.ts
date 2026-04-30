import type { ValidationIssue, ValidationRule } from "../types.js";

interface LinkLike {
  type: string;
  target: string;
}

const LOW_THRESHOLD = 0.5;

export const confidenceLow: ValidationRule = {
  name: "confidence-low",
  run(ctx) {
    const byId = new Map(ctx.allNodes.map((n) => [n.id, n] as const));
    const referencedByActive = new Set<string>();
    for (const node of ctx.allNodes) {
      if ((node.type !== "spec" && node.type !== "plan") || node.frontmatter.status !== "active")
        continue;
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const l of links) if (l?.target) referencedByActive.add(l.target);
    }
    const issues: ValidationIssue[] = [];
    for (const id of referencedByActive) {
      const target = byId.get(id);
      if (!target) continue;
      const prov = target.frontmatter.provenance as { confidence?: number } | undefined;
      if (typeof prov?.confidence === "number" && prov.confidence < LOW_THRESHOLD) {
        issues.push({
          rule: "confidence-low",
          severity: "info" as const,
          message: `${id} referenced by an active node has low confidence: ${prov.confidence}`,
          nodeType: target.type,
          nodeId: id,
          path: target.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
