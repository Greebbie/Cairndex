import type { ValidationIssue, ValidationRule } from "../types.js";

const DEFAULT_DAYS = 30;

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.floor((db - da) / 86400000);
}

function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export const freshness: ValidationRule = {
  name: "freshness",
  run(ctx) {
    const today = todayUtc();
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const status = String(node.frontmatter.status ?? "");
      if (status !== "active") continue;
      const updated = String(node.frontmatter.updated ?? node.frontmatter.created ?? "");
      if (!updated) continue;
      if (daysBetween(updated, today) > DEFAULT_DAYS) {
        issues.push({
          rule: "freshness",
          severity: "warn" as const,
          message: `${node.id} active but updated > ${DEFAULT_DAYS} days ago (${updated})`,
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
