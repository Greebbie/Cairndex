import type { NodeType } from "../types.js";

/**
 * One item included in a context pack. Each carries a `reason` so the agent
 * (and the user reading the Pack Preview) can see *why* it was selected.
 */
export interface ContextPackItem {
  /** Logical kind. "project-state" is a synthetic header item. */
  type: NodeType | "project-state";
  /** Node id, or "PROJECT-STATE" for the synthetic header. */
  id: string;
  title: string;
  status?: string;
  /** Why this item was included; user-facing. */
  reason: string;
  /** Lower number = higher priority; budget trim drops higher-numbered items first. */
  reasonPriority: number;
  /** Body excerpt (markdown). May be empty for synthetic items. */
  body: string;
}

export interface ContextPackOutput {
  /** User-supplied task label (pure label — does not affect selection in v1). */
  task: string;
  /** Slugified task + short hash; suffix-only stable across re-runs. */
  packId: string;
  /** ISO timestamp. */
  builtAt: string;
  /** Estimated token count for the entire pack body (char/4 heuristic). */
  tokenEstimate: number;
  /** How many candidate items were trimmed because of token budget. */
  trimmedItems: number;
  /** Configured budget at build time. */
  tokenBudget: number;
  /** Surface concerns (multiple active specs, etc.). */
  warnings: string[];
  /** Ordered, post-trim list of items. */
  items: ContextPackItem[];
}

export interface BuildContextPackInput {
  task?: string;
  /** How many recent sessions to surface (default 4). */
  recentSessionsLimit?: number;
  /** Override default token budget (default 8000). */
  tokenBudget?: number;
}

/** Reason priorities. Lower = more important; never trimmed. */
export const PRIORITY = {
  PROJECT_STATE: 1,
  ACTIVE_SPEC: 1,
  ACTIVE_PLAN: 1,
  CURRENT_TASK: 1,
  ACTIVE_GOAL: 1,
  BACKLINKED_DECISION: 2,
  OPEN_QUESTION: 3,
  RECENT_SESSION: 4,
} as const;
