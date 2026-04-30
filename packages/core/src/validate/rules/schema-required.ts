import type { NodeType } from "../../types.js";
import type { ValidationIssue, ValidationRule } from "../types.js";

const REQUIRED: Record<NodeType, string[]> = {
  spec: ["id", "title", "status", "created", "updated"],
  decision: ["id", "title", "status", "created"],
  plan: ["id", "title", "status", "created", "updated"],
  task: ["id", "title", "status", "created", "updated"],
  goal: ["id", "title", "status", "created"],
  intent: ["id", "title", "created"],
  session: ["id", "date", "summary"],
  insight: ["id", "title", "status", "created"],
  question: ["id", "title", "status", "created"],
  change: ["id", "date", "type", "target", "summary"],
};

export const schemaRequired: ValidationRule = {
  name: "schema-required",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    for (const node of ctx.allNodes) {
      const required = REQUIRED[node.type];
      for (const field of required) {
        if (
          !(field in node.frontmatter) ||
          node.frontmatter[field] === undefined ||
          node.frontmatter[field] === null
        ) {
          issues.push({
            rule: "schema-required",
            severity: "error" as const,
            message: `${node.type} ${node.id} missing required field: ${field}`,
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
