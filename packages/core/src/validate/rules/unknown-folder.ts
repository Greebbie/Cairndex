import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listAllTypes, loadProjectConfig } from "../../config.js";
import { vaultPath } from "../../paths.js";
import type { ValidationIssue, ValidationRule } from "../types.js";

// Folders that aren't node-bearing but are part of the vault layout. Plugins / new
// derived layers should be added here rather than re-introducing a hardcoded
// node-folder list.
const ALLOWED_EXTRA = new Set([
  "archive",
  "templates",
  "rules",
  "context",
  ".sync-conflicts",
  "indexes",
  "inbox",
  // Phase D: scratchpad for transient turn-state JSON (last-turn-summary.json,
  // future ephemeral status files). Not durable memory, intentionally non-node.
  "state",
]);

export const unknownFolder: ValidationRule = {
  name: "unknown-folder",
  run(ctx) {
    const root = vaultPath(ctx.repoRoot);
    if (!existsSync(root)) return [];
    // Anything declared in cfg.folders OR cfg.node_types is "known" — built-ins
    // plus any custom type the user has added via Settings.
    const cfg = loadProjectConfig(ctx.repoRoot);
    const declared = new Set(listAllTypes(cfg).map((t) => t.folder));
    const entries = readdirSync(root, { withFileTypes: true });
    const issues: ValidationIssue[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (ALLOWED_EXTRA.has(e.name) || declared.has(e.name)) continue;
      issues.push({
        rule: "unknown-folder",
        severity: "warn" as const,
        message: `unknown folder: ${e.name}`,
        path: join(root, e.name),
        fixable: false,
      });
    }
    return issues;
  },
};
