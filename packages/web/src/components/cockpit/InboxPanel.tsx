import { TextWithResolvedIds } from "@/components/InlineNodeRef";
import { useInbox } from "@/lib/api";
import type { Proposal } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
}

/**
 * Strip the "Auto-distilled insight: " prefix that the auto-distill heuristic
 * prepends to its proposal summaries. The "auto" badge in the action line
 * already conveys the heuristic provenance — leave the actual headline content
 * intact so the user can distinguish two heuristic noise items at a glance.
 */
function summaryHeadline(summary: string): string {
  const a = summary.match(/^Auto-distilled insight:\s*(.+)$/);
  if (a) return a[1] ?? summary;
  return summary;
}

/**
 * True for proposals the auto-distill OR auto-consolidate heuristics generated.
 * The vibe coder's working question is "does anything need my decision?", and
 * heuristic-only proposals (no explicit agent intent behind them) count as
 * suggestions, not decisions. Surfaced as a separate count in the panel header.
 */
function isHeuristicNoise(p: Proposal): boolean {
  return (
    p.provenance.createdBy === "auto-distill" || p.provenance.createdBy === "cairndex-consolidate"
  );
}

interface ProposalGroup {
  /** Stable key used to group identical-summary proposals. */
  key: string;
  /** Display headline (cleaned of meta prefixes). */
  headline: string;
  /** Members of the group, newest-first by id. */
  members: Proposal[];
  /** True when every member is auto-distilled (matches `provenance.createdBy`). */
  allAutoDistilled: boolean;
  /** Lowest confidence among members; null when no member carries one. */
  minConfidence: number | null;
}

function groupBySummary(pending: readonly Proposal[]): ProposalGroup[] {
  const map = new Map<string, ProposalGroup>();
  for (const p of pending) {
    const key = p.summary;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        headline: summaryHeadline(p.summary),
        members: [],
        allAutoDistilled: true,
        minConfidence: null,
      };
      map.set(key, g);
    }
    g.members.push(p);
    if (p.provenance.createdBy !== "auto-distill") g.allAutoDistilled = false;
    const c = p.provenance.confidence;
    if (typeof c === "number") {
      g.minConfidence = g.minConfidence === null ? c : Math.min(g.minConfidence, c);
    }
  }
  return Array.from(map.values());
}

export function InboxPanel({ alias }: Props) {
  const inbox = useInbox(alias);
  const pending = inbox.data?.pending ?? [];
  const accepted = inbox.data?.accepted ?? [];
  const rejected = inbox.data?.rejected ?? [];
  const autoCount = accepted.filter((p) => p.acceptedBy === "auto").length;

  const groups = groupBySummary(pending);
  // Sort: collapsed groups (size > 1, lowest signal) drop to the bottom; singletons
  // bubble up so the user sees the high-signal proposals first.
  groups.sort((a, b) => {
    const aGroup = a.members.length > 1 ? 1 : 0;
    const bGroup = b.members.length > 1 ? 1 : 0;
    if (aGroup !== bGroup) return aGroup - bGroup;
    // Within the same kind, newest-first by leading proposalId.
    const aId = a.members[0]?.proposalId ?? "";
    const bId = b.members[0]?.proposalId ?? "";
    return aId < bId ? 1 : aId > bId ? -1 : 0;
  });

  // Split count by proposalType for the existing dashboard hint — preserves the
  // signal the user uses to gauge "how much new direction is queued."
  const newCount = pending.filter((p) => p.proposalType === "create").length;
  const updateCount = pending.filter((p) => p.proposalType === "update").length;

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Review Inbox
        </h3>
        <Link to={`/p/${alias}/inbox`} className="text-xs text-primary hover:underline">
          Open inbox →
        </Link>
      </div>
      {inbox.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Nothing waiting for your decision.{" "}
          <span className="text-xs">
            ({accepted.length} accepted
            {autoCount > 0 ? ` · ${autoCount} auto` : ""} · {rejected.length} rejected)
          </span>
        </div>
      ) : (
        (() => {
          // Split signal vs noise. The headline answers the user's actual question
          // ("does anything need me?"), then the heuristic suggestions are surfaced
          // as a separate, opt-in line — never as the primary count.
          const decision = pending.filter((p) => !isHeuristicNoise(p));
          const noise = pending.filter(isHeuristicNoise);
          return (
            <div className="text-sm space-y-1">
              <div>
                {decision.length > 0 ? (
                  <>
                    <span className="font-mono text-amber-700 dark:text-amber-300">
                      {decision.length}
                    </span>{" "}
                    {decision.length === 1 ? "thing" : "things"} need
                    {decision.length === 1 ? "s" : ""} your decision
                  </>
                ) : (
                  <span className="text-muted-foreground">Nothing needing your decision.</span>
                )}
                {noise.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {noise.length} heuristic suggestion{noise.length === 1 ? "" : "s"}{" "}
                    (auto-noise)
                  </span>
                ) : null}
                {decision.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    ({newCount} new · {updateCount} update{updateCount === 1 ? "" : "s"})
                  </span>
                ) : null}
              </div>
              <ul className="text-xs space-y-0.5">
                {groups.slice(0, 3).map((g) => {
                  const lead = g.members[0];
                  if (!lead) return null;
                  if (g.members.length > 1) {
                    // Grouped: a single line collapses N near-duplicate proposals (the
                    // dogfood "Recurring focus on SPEC-X" pile-up). Each member's PROP
                    // ID lives in the title tooltip — agent surface, not visible text.
                    const idsTip = g.members.map((m) => m.proposalId).join(", ");
                    const lowConfTag =
                      g.allAutoDistilled || (g.minConfidence !== null && g.minConfidence < 0.5)
                        ? " (low confidence)"
                        : "";
                    return (
                      <li key={g.key} className="text-muted-foreground">
                        <Link
                          to={`/p/${alias}/inbox`}
                          title={idsTip}
                          className="text-primary hover:underline"
                        >
                          <em className="not-italic font-medium">
                            <TextWithResolvedIds alias={alias} text={g.headline} />
                          </em>{" "}
                          ×{g.members.length}
                        </Link>
                        {lowConfTag}
                      </li>
                    );
                  }
                  // Singleton: title-as-headline. The PROP ID becomes the link's
                  // title attribute so power users can hover-reveal it without it
                  // dominating the row.
                  return (
                    <li key={g.key} className="text-muted-foreground">
                      <Link
                        to={`/p/${alias}/inbox`}
                        title={lead.proposalId}
                        className="text-primary hover:underline"
                      >
                        <em className="not-italic">
                          <TextWithResolvedIds alias={alias} text={g.headline} />
                        </em>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {groups.length > 3 ? (
                <div className="text-xs text-muted-foreground">
                  + {groups.length - 3} more group{groups.length - 3 === 1 ? "" : "s"}
                </div>
              ) : null}
            </div>
          );
        })()
      )}
    </section>
  );
}
