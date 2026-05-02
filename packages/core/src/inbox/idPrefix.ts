import { parseId } from "../ids.js";
import type { NodeType } from "../types.js";

export const PREFIX_FOR_TYPE: Record<NodeType, string> = {
  goal: "GOAL",
  intent: "INT",
  spec: "SPEC",
  decision: "ADR",
  plan: "PLAN",
  task: "TASK",
  // Sessions use date-form ids — not auto-allocated by inbox.
  session: "SESSION",
  change: "CHG",
  insight: "INS",
  question: "QUESTION",
};

const TYPE_FOR_PREFIX: Record<string, NodeType> = Object.fromEntries(
  (Object.entries(PREFIX_FOR_TYPE) as [NodeType, string][]).map(([t, p]) => [p, t]),
);

/**
 * Infer the node type from a sequential id like `SPEC-001` or `ADR-042`.
 * Returns null when the id doesn't parse or the prefix doesn't map to a known type.
 */
export function inferNodeTypeFromId(id: string): NodeType | null {
  const parsed = parseId(id);
  if (!parsed) return null;
  return TYPE_FOR_PREFIX[parsed.prefix] ?? null;
}
