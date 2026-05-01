import type { NodeType } from "../types.js";

export type Severity = "error" | "warn" | "info";

export interface ValidationIssue {
  rule: string;
  severity: Severity;
  message: string;
  nodeType?: NodeType;
  nodeId?: string;
  path?: string;
  fixable: boolean;
  /** Structured metadata for auto-fixers; avoids regex-parsing of `message`. */
  meta?: Record<string, string>;
}

export interface ValidationContext {
  repoRoot: string;
  // populated before rules run
  allNodes: ReadonlyArray<{
    type: NodeType;
    id: string;
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }>;
}

export interface ValidationRule {
  name: string;
  run(ctx: ValidationContext): ValidationIssue[];
}
