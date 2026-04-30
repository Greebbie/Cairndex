import type { ValidationIssue, ValidationRule } from "../types.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const tagFormat: ValidationRule = {
  name: "tag-format",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const tags = node.frontmatter.tags;
      if (!Array.isArray(tags)) continue;
      for (const t of tags) {
        if (typeof t !== "string" || !KEBAB.test(t)) {
          issues.push({
            rule: "tag-format",
            severity: "warn" as const,
            message: `${node.id} has non-kebab-case tag: ${String(t)}`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: true,
          });
        }
      }
    }
    return issues;
  },
};
