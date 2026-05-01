import type { NodeType } from "../../types.js";
import type { ValidationIssue, ValidationRule } from "../types.js";

/** Node types where it is a contradiction to have more than one node simultaneously
 *  marked as the "active" one. (Multiple active tasks are normal and expected.) */
const SINGLETON_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(["spec", "plan", "goal"]);

const ACTIVE_STATUSES = new Set(["active"]);

export const multipleActive: ValidationRule = {
  name: "multiple-active",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const byType = new Map<NodeType, typeof ctx.allNodes[number][]>();
    for (const n of ctx.allNodes) {
      if (!SINGLETON_TYPES.has(n.type)) continue;
      const status = String(n.frontmatter.status ?? "");
      if (!ACTIVE_STATUSES.has(status)) continue;
      const list = byType.get(n.type) ?? [];
      list.push(n);
      byType.set(n.type, list);
    }

    for (const [type, nodes] of byType) {
      if (nodes.length < 2) continue;
      const ids = nodes.map((n) => n.id).join(", ");
      for (const node of nodes) {
        issues.push({
          rule: "multiple-active",
          severity: "warn" as const,
          message: `multiple ${type} nodes are marked active simultaneously: ${ids}. Pick one and mark the others superseded or done.`,
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
