/**
 * Display helpers for changelog event summaries (the lines under
 * `changes/changelog.md` that the Stop hook + accept/reject path append).
 *
 * The on-disk format is agent surface — codes (PROP-XXX, SPEC-XXX) and
 * proposalType/targetType prefixes that mean nothing to a vibe coder reading
 * the dashboard. These helpers lift the meaningful headline out for the
 * human-facing surfaces (Dashboard "Recent Activity" + Timeline page).
 *
 * The display rule for the rest of the app: titles/summaries are the headline,
 * IDs are tooltip/link target only. These helpers exist so every surface that
 * renders changelog lines applies that rule the same way.
 */

/**
 * "Session 2026-05-03-XXXX recorded (Edit×N Write×N Bash×N Read×N)" rows are
 * audit-trail receipts written by every Stop hook — they tell a vibe coder
 * nothing useful and crowd out narrative events. Drop them at display time;
 * the raw line stays in the changelog file for anyone who wants the receipt.
 */
export function isSessionReceipt(summary: string): boolean {
  return /^Session\s+\S+\s+recorded\b/.test(summary);
}

/**
 * "Proposed PROP-XXX (create insight): Auto-distilled insight: ..." OR
 * "Proposed PROP-XXX (create insight): Pattern around ..." are heuristic
 * suggestions, not project events. They flood Recent Activity / LastTurnCard
 * because every session generates a few. Filter them out — the user's question
 * "what happened with my project?" doesn't include "the heuristic guessed something."
 *
 * Real proposals (agent-authored, not heuristic) still show through because their
 * inner summary doesn't carry these prefixes.
 */
export function isHeuristicProposalEvent(summary: string): boolean {
  return /^Proposed\s+PROP-\d+\s+\([^)]*\):\s*(?:Auto-distilled insight:|Pattern around\s+[A-Z]+-\d+)/.test(
    summary,
  );
}

/**
 * `Accepted PROP-XXX → created insight/INS-YYY` (or rejected). The format is the
 * "X was routed to Y" audit trail; on its own it carries no project information,
 * just two opaque IDs. When a single one shows up it's an explicit accept; when
 * many show up in one turn it's an auto-accept batch (the user's autoAcceptConfidence
 * threshold caught a swarm of heuristic proposals).
 */
export function isProposalRoutingEvent(summary: string): boolean {
  return /^(?:Accepted|Rejected)\s+PROP-\d+\b/.test(summary);
}

/** Reference to a node mentioned in a changelog event — used to resolve titles for display. */
export interface EventTargetRef {
  type: string;
  id: string;
}

/** Parsed verb for routing events (proposal accept/reject paths). */
export type RoutingVerb = "Accepted" | "Rejected";

export interface CollapsedEvent {
  /** Original date string from the underlying event (the most recent in a batch). */
  date: string;
  /**
   * Pre-formatted text for events that don't need ID resolution. When `routing`
   * or `batch` is set, the renderer should ignore `text` and produce its own
   * display by resolving the referenced nodes to titles.
   */
  text: string;
  /** Hover tooltip (the original raw summary, or a list when collapsed). */
  tooltip: string;
  /** Number of underlying events folded into this row (1 for singletons). */
  count: number;
  /**
   * Singleton routing event — proposal was accepted/rejected, optionally with a
   * resulting target. The renderer resolves `target` to a title via useNode and
   * shows "Accepted: <title> (insight)" instead of the raw "PROP-X → INS-Y" line.
   */
  routing?: {
    verb: RoutingVerb;
    proposalId: string;
    target: EventTargetRef | null;
  };
  /**
   * Collapsed batch — N consecutive routing events. Carries a sample of target
   * refs (first 3) so the renderer can show "incl. <title-A>, <title-B>, ..."
   * via lookup, giving the user *some* sense of what was batched.
   */
  batch?: {
    accepts: number;
    rejects: number;
    sampleTargets: EventTargetRef[];
  };
}

const ROUTING_RE =
  /^(Accepted|Rejected)\s+(PROP-\d+)(?:\s+→\s+(?:created|updated)\s+([a-z]+)\/([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4}))?/;

function parseRoutingEvent(summary: string):
  | { verb: RoutingVerb; proposalId: string; target: EventTargetRef | null }
  | null {
  const m = summary.match(ROUTING_RE);
  if (!m) return null;
  const verb = m[1] as RoutingVerb;
  const proposalId = m[2] ?? "";
  if (m[3] && m[4]) return { verb, proposalId, target: { type: m[3], id: m[4] } };
  return { verb, proposalId, target: null };
}

/**
 * Fold a list of changelog events into a display-ready list:
 *   - drops session-recorded receipts (audit, not narrative)
 *   - drops heuristic-proposal events (system housekeeping)
 *   - collapses runs of ≥3 consecutive routing events (batch accepts/rejects)
 *     into a single summary row, preserving the full ID list in the tooltip
 *   - humanizes singleton routing + other events via humanizeChangelogSummary
 *
 * The threshold is 3 because two accepts in one turn might be the user manually
 * triaging two real proposals. Three+ in a row is almost always auto-accept noise.
 */
const BATCH_THRESHOLD = 3;

export function foldChangelogForDisplay(
  events: readonly { date: string; summary: string }[],
): CollapsedEvent[] {
  const visible = events.filter(
    (e) => !isSessionReceipt(e.summary) && !isHeuristicProposalEvent(e.summary),
  );
  const out: CollapsedEvent[] = [];
  let i = 0;
  while (i < visible.length) {
    const e = visible[i];
    if (!e) {
      i += 1;
      continue;
    }
    if (isProposalRoutingEvent(e.summary)) {
      // Look ahead — collect the consecutive run of routing events.
      let j = i;
      while (j < visible.length) {
        const next = visible[j];
        if (!next || !isProposalRoutingEvent(next.summary)) break;
        j += 1;
      }
      const runLen = j - i;
      if (runLen >= BATCH_THRESHOLD) {
        const batch = visible.slice(i, j);
        const parsed = batch
          .map((b) => parseRoutingEvent(b.summary))
          .filter((r): r is NonNullable<ReturnType<typeof parseRoutingEvent>> => r !== null);
        const accepts = parsed.filter((r) => r.verb === "Accepted").length;
        const rejects = parsed.filter((r) => r.verb === "Rejected").length;
        const sampleTargets = parsed
          .map((r) => r.target)
          .filter((t): t is EventTargetRef => t !== null)
          .slice(0, 3);
        out.push({
          date: batch[0]?.date ?? e.date,
          // text is a fallback for renderers that don't resolve titles (e.g.
          // tests). Real renderer uses `batch` to look up sampleTargets.
          text: `${runLen} proposals batch-routed (${accepts} accepted, ${rejects} rejected)`,
          tooltip: batch.map((b) => b.summary).join("\n"),
          count: runLen,
          batch: { accepts, rejects, sampleTargets },
        });
        i = j;
        continue;
      }
      // Singleton routing event — let the renderer resolve the target's title
      // so the user sees "Accepted: <title>" not "Accepted PROP-X → INS-Y".
      const r = parseRoutingEvent(e.summary);
      if (r) {
        out.push({
          date: e.date,
          text: humanizeChangelogSummary(e.summary).text,
          tooltip: e.summary,
          count: 1,
          routing: r,
        });
        i += 1;
        continue;
      }
    }
    const h = humanizeChangelogSummary(e.summary);
    out.push({ date: e.date, text: h.text, tooltip: h.tooltip, count: 1 });
    i += 1;
  }
  return out;
}

/**
 * Lift the meaningful headline out of an agent-data-shaped changelog summary.
 *
 * Examples (before → after):
 *   "Proposed PROP-026 (create insight): Auto-distilled insight: Recurring focus on SPEC-001"
 *     → "Agent suggested an insight: Recurring focus on SPEC-001"
 *   "Accepted PROP-014 (create insight): tighten retry semantics"
 *     → "Accepted: tighten retry semantics"
 *
 * The PROP/SPEC IDs and the proposalType/targetType prefix become tooltip
 * text. The "Auto-distilled insight: <title>" prefix carried by auto-distill
 * proposals is also stripped — the headline is the actual insight title.
 *
 * Falls back to the raw summary when no recognized pattern matches.
 */
export function humanizeChangelogSummary(s: string): { text: string; tooltip: string } {
  const tooltip = s;
  let m = s.match(/^Proposed (PROP-\d+) \([^)]+\):\s*(.+)$/);
  if (m) {
    const inner = m[2] ?? "";
    const insight = inner.match(/^Auto-distilled insight:\s*(.+)$/);
    const headline = insight ? (insight[1] ?? inner) : inner;
    return { text: `Agent suggested an insight: ${headline}`, tooltip };
  }
  m = s.match(/^Accepted (PROP-\d+)(?:\s*\([^)]+\))?:\s*(.+)$/);
  if (m) return { text: `Accepted: ${m[2] ?? ""}`, tooltip };
  m = s.match(/^Rejected (PROP-\d+)(?:\s*\([^)]+\))?:\s*(.+)$/);
  if (m) return { text: `Rejected: ${m[2] ?? ""}`, tooltip };
  return { text: s, tooltip };
}
