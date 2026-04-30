import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { vaultPath } from "../../paths.js";
import type { ValidationIssue, ValidationRule } from "../types.js";

const ALLOWED_EXTRA = new Set(["archive", "templates", "rules", "context", ".sync-conflicts"]);

const KNOWN_NODE_FOLDERS = new Set([
  "goals",
  "intents",
  "specs",
  "decisions",
  "plans",
  "tasks",
  "sessions",
  "changes",
  "insights",
  "questions",
]);

export const unknownFolder: ValidationRule = {
  name: "unknown-folder",
  run(ctx) {
    const root = vaultPath(ctx.repoRoot);
    if (!existsSync(root)) return [];
    const entries = readdirSync(root, { withFileTypes: true });
    const issues: ValidationIssue[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (ALLOWED_EXTRA.has(e.name) || KNOWN_NODE_FOLDERS.has(e.name)) continue;
      issues.push({
        rule: "unknown-folder",
        severity: "warn" as const,
        message: `unknown folder under .cairndex/: ${e.name}`,
        path: join(root, e.name),
        fixable: false,
      });
    }
    return issues;
  },
};
