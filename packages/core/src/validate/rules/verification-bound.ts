import type { ValidationIssue, ValidationRule } from "../types.js";

const REQUIRES_VERIFICATION: Record<string, ReadonlySet<string>> = {
  spec: new Set(["done"]),
  plan: new Set(["done"]),
  task: new Set(["done"]),
  decision: new Set(["accepted"]),
  goal: new Set(["achieved"]),
  insight: new Set(),
  intent: new Set(),
  session: new Set(),
  change: new Set(),
  question: new Set(["answered"]),
};

export const verificationBound: ValidationRule = {
  name: "verification-bound",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const status = String(node.frontmatter.status ?? "");
      const required = REQUIRES_VERIFICATION[node.type];
      if (!required || !required.has(status)) continue;
      const v = node.frontmatter.verification as
        | { test?: unknown; commit?: unknown; run?: unknown }
        | undefined;
      const has = v && (v.test || v.commit || v.run);
      if (!has) {
        issues.push({
          rule: "verification-bound",
          severity: "error" as const,
          message: `${node.id} has status: ${status} but no verification (test/commit/run) is set`,
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
