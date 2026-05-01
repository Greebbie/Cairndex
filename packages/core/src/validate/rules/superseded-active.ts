import type { ValidationIssue, ValidationRule } from "../types.js";

interface LinkLike {
  type: string;
  target: string;
}

/** Statuses that imply the node is still in force. If a node carries a `superseded_by`
 *  link, its own status MUST flip to `superseded`; otherwise the vault claims the node
 *  is simultaneously the live one and the obsolete one. */
const ACTIVE_STATUSES = new Set(["active", "accepted"]);

export const supersededActive: ValidationRule = {
  name: "superseded-active",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const status = String(node.frontmatter.status ?? "");
      if (!ACTIVE_STATUSES.has(status)) continue;
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      const supersededBy = links.filter((l) => l?.type === "superseded_by");
      if (supersededBy.length === 0) continue;
      const targets = supersededBy.map((l) => l.target).join(", ");
      issues.push({
        rule: "superseded-active",
        severity: "error" as const,
        message: `${node.id} has status: ${status} but is superseded_by ${targets}. Flip status to "superseded" or remove the link.`,
        nodeType: node.type,
        nodeId: node.id,
        path: node.path,
        fixable: false,
      });
    }
    return issues;
  },
};
