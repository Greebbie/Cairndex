import type { ValidationIssue, ValidationRule } from "../types.js";

interface LinkLike {
  type: string;
  target: string;
}

const RECIPROCALS: Record<string, string> = {
  supersedes: "superseded_by",
  superseded_by: "supersedes",
  blocks: "blocked_by",
  blocked_by: "blocks",
};

export const bidirectional: ValidationRule = {
  name: "bidirectional",
  run(ctx) {
    const byId = new Map(ctx.allNodes.map((n) => [n.id, n] as const));
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        const reciprocal = RECIPROCALS[link.type];
        if (!reciprocal) continue;
        const target = byId.get(link.target);
        if (!target) continue; // reference-integrity flags this.
        const targetLinks = (target.frontmatter.links ?? []) as LinkLike[];
        const has =
          Array.isArray(targetLinks) &&
          targetLinks.some((l) => l.type === reciprocal && l.target === node.id);
        if (!has) {
          issues.push({
            rule: "bidirectional",
            severity: "error" as const,
            message: `${node.id}.${link.type} -> ${link.target}, but ${link.target}.${reciprocal} -> ${node.id} is missing`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: true,
            meta: { sourceId: node.id, targetId: link.target, reciprocal },
          });
        }
      }
    }
    return issues;
  },
};
