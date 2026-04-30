import type { ValidationIssue, ValidationRule } from "../types.js";

export const idCollision: ValidationRule = {
  name: "id-collision",
  run(ctx) {
    const seen = new Map<string, string[]>();
    for (const n of ctx.allNodes) {
      const list = seen.get(n.id) ?? [];
      list.push(n.path);
      seen.set(n.id, list);
    }
    const issues: ValidationIssue[] = [];
    for (const [id, paths] of seen) {
      if (paths.length > 1) {
        for (const p of paths) {
          issues.push({
            rule: "id-collision",
            severity: "error" as const,
            message: `id ${id} appears in multiple files: ${paths.join(", ")}`,
            nodeId: id,
            path: p,
            fixable: false,
          });
        }
      }
    }
    return issues;
  },
};
