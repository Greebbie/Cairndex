import { EventLine } from "@/components/EventLine";
import { useLastTurnSummary } from "@/lib/api";
import { foldChangelogForDisplay } from "@/lib/changelogFormat";
import { humanizeDateString } from "@/lib/time";
import type { LastTurnSummary } from "@/lib/types";

interface Props {
  alias: string;
}

type Metrics = Pick<LastTurnSummary, "filesTouched" | "toolCounts" | "newProposals">;

function summarize(s: Metrics): string {
  const parts: string[] = [];
  const totalToolCalls =
    s.toolCounts.Edit + s.toolCounts.Write + s.toolCounts.Bash + s.toolCounts.Read;
  if (s.filesTouched > 0)
    parts.push(`${s.filesTouched} file${s.filesTouched === 1 ? "" : "s"} touched`);
  if (totalToolCalls > 0)
    parts.push(`${totalToolCalls} tool call${totalToolCalls === 1 ? "" : "s"}`);
  if (s.newProposals.length > 0) {
    parts.push(`${s.newProposals.length} proposal${s.newProposals.length === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no observable activity";
}

/**
 * "This turn" card. Renders the last-turn metric line plus a narrative list of
 * changelog events that happened during the turn — proposals accepted/rejected,
 * task switch/complete, phase change. Fetched via React Query and invalidated by
 * SSE in `useWatcherEvents`, so it refreshes within ~1s of session end.
 *
 * The events list answers "what did Claude actually accomplish?" without falling
 * back to "see metrics, hope they map to outcomes." Falls back gracefully to the
 * metric-only display when events are empty (e.g. fresh project, parse failure).
 */
export function LastTurnCard({ alias }: Props) {
  const { data } = useLastTurnSummary(alias);
  const s = data?.summary ?? null;
  if (!s) return null;
  // events is added by the server route; the schema makes it optional with default
  // []. foldChangelogForDisplay drops session-receipts and heuristic proposals
  // (system housekeeping, not project narrative), AND collapses runs of ≥3
  // accept/reject events into a single batch row — without this, an auto-accept
  // sweep buries the actual narrative under 20 routing-id lines.
  const narrative = foldChangelogForDisplay(s.events ?? []);
  return (
    <div
      data-testid="last-turn-card"
      className="rounded border border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2 text-sm space-y-1.5"
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
        <span className="font-medium text-emerald-800 dark:text-emerald-300">Last turn</span>
        <span className="text-foreground">{summarize(s)}</span>
        {s.latestSessionId ? (
          <span className="font-mono text-xs text-muted-foreground">{s.latestSessionId}</span>
        ) : null}
        <span className="text-xs text-muted-foreground" title={s.ts}>
          {humanizeDateString(s.ts)}
        </span>
      </div>
      {narrative.length > 0 ? (
        <ul data-testid="last-turn-events" className="text-xs text-foreground/90 pl-1 space-y-0.5">
          {narrative.map((e, idx) => (
            <li key={`${e.date}-${idx}`} className="flex gap-2">
              <span className="text-emerald-700/70 dark:text-emerald-300/70 select-none">·</span>
              <EventLine alias={alias} event={e} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
