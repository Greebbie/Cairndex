import type { ContextPackItem } from "./types.js";

/**
 * Approximate token count using a char/4 heuristic.
 * Good enough for v1 budgeting; replace with tiktoken if drift becomes a problem.
 */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function itemSize(item: ContextPackItem): number {
  // Account for both header and body content the renderer will emit.
  const header = `${item.id} — ${item.title} (${item.status ?? ""}) — ${item.reason}`;
  return estimateTokens(header) + estimateTokens(item.body);
}

export interface TrimResult {
  items: ContextPackItem[];
  tokenEstimate: number;
  trimmedItems: number;
}

/**
 * Trim items to fit within `tokenBudget`. Priority-1 items (active spec/plan/task,
 * project-state, active-goal) are never dropped — if they alone exceed budget,
 * they are still included and the result is over budget. Lower-priority items are
 * dropped from the highest priority number first (i.e. recent sessions go first).
 */
export function trimToBudget(items: ContextPackItem[], tokenBudget: number): TrimResult {
  // Phase 1: always-keep priority 1 items.
  const keep: ContextPackItem[] = [];
  const candidates: ContextPackItem[] = [];
  for (const it of items) {
    if (it.reasonPriority === 1) keep.push(it);
    else candidates.push(it);
  }

  // Phase 2: candidates ordered by priority ascending (smaller = more important first).
  candidates.sort((a, b) => a.reasonPriority - b.reasonPriority);

  let runningTokens = keep.reduce((acc, it) => acc + itemSize(it), 0);
  const accepted: ContextPackItem[] = [];
  let trimmedItems = 0;
  for (const it of candidates) {
    const cost = itemSize(it);
    if (runningTokens + cost > tokenBudget) {
      trimmedItems += 1;
      continue;
    }
    accepted.push(it);
    runningTokens += cost;
  }

  // Restore the original ordering by walking the source list and emitting in original positions.
  const acceptedIds = new Set(accepted.map((i) => i.id));
  const result: ContextPackItem[] = [];
  for (const it of items) {
    if (it.reasonPriority === 1) result.push(it);
    else if (acceptedIds.has(it.id)) result.push(it);
  }

  return { items: result, tokenEstimate: runningTokens, trimmedItems };
}
