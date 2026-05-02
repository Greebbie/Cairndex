import { useLastTurnSummary } from "@/lib/api";
import { humanizeDateString } from "@/lib/time";
import type { LastTurnSummary } from "@/lib/types";

interface Props {
  alias: string;
}

function summarize(s: LastTurnSummary): string {
  const parts: string[] = [];
  const totalToolCalls =
    s.toolCounts.Edit + s.toolCounts.Write + s.toolCounts.Bash + s.toolCounts.Read;
  if (s.filesTouched > 0) parts.push(`${s.filesTouched} file${s.filesTouched === 1 ? "" : "s"} touched`);
  if (totalToolCalls > 0) parts.push(`${totalToolCalls} tool call${totalToolCalls === 1 ? "" : "s"}`);
  if (s.newProposals.length > 0) {
    parts.push(`${s.newProposals.length} proposal${s.newProposals.length === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no observable activity";
}

/**
 * Compact "this turn" card. Renders a one-liner with last-turn metrics whenever the
 * Stop hook has produced `state/last-turn-summary.json`. Fetched via React Query and
 * invalidated by SSE in `useWatcherEvents`, so it refreshes within ~1s of session end.
 */
export function LastTurnCard({ alias }: Props) {
  const { data } = useLastTurnSummary(alias);
  const s = data?.summary ?? null;
  if (!s) return null;
  return (
    <div
      data-testid="last-turn-card"
      className="rounded border border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2 text-sm flex flex-wrap gap-x-3 gap-y-1 items-baseline"
    >
      <span className="font-medium text-emerald-800 dark:text-emerald-300">Last turn</span>
      <span className="text-foreground">{summarize(s)}</span>
      {s.latestSessionId ? (
        <span className="font-mono text-xs text-muted-foreground">{s.latestSessionId}</span>
      ) : null}
      <span className="text-xs text-muted-foreground" title={s.ts}>
        {humanizeDateString(s.ts)}
      </span>
    </div>
  );
}
