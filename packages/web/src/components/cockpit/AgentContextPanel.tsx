import { useComposePack } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface Props {
  alias: string;
  agentContext: Dashboard["agentContext"];
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function AgentContextPanel({ alias, agentContext }: Props) {
  const latest = agentContext.latestPack;
  const isStale = latest?.stale === true;
  const compose = useComposePack();
  const navigate = useNavigate();
  const [rebuildError, setRebuildError] = useState<string | null>(null);

  const onRebuild = async () => {
    setRebuildError(null);
    try {
      // No task scope — the user is rebuilding the latest pack to refresh against
      // current memory, not changing what it covers. Default-scope is correct.
      const r = await compose.mutateAsync({ alias });
      navigate(`/p/${alias}/pack/${r.packId}`);
    } catch (err) {
      setRebuildError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Agent Context
        </h3>
        <Link to={`/p/${alias}/pack`} className="text-xs text-primary hover:underline">
          Compose new pack →
        </Link>
      </div>
      {latest ? (
        <div className="text-sm space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Last pack</div>
              <Link
                to={`/p/${alias}/pack/${latest.id}`}
                className="font-mono text-primary hover:underline break-all"
              >
                {latest.id}
              </Link>
              <div className="text-xs text-muted-foreground">Built {fmtDate(latest.builtAt)}</div>
            </div>
            <span
              className={
                isStale
                  ? "shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                  : "shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
              }
            >
              {isStale ? "Needs refresh" : "Current"}
            </span>
          </div>
          {isStale ? (
            <div className="rounded border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 px-3 py-2 space-y-2">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Pack is behind vault memory</div>
                {latest.lastMemoryChangeAt ? (
                  <div className="text-xs text-amber-900/80 dark:text-amber-100/80">
                    Last vault change: {fmtDate(latest.lastMemoryChangeAt)}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onRebuild}
                  disabled={compose.isPending}
                  className="rounded bg-amber-700 text-white px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                >
                  {compose.isPending ? "Rebuilding..." : "Rebuild now"}
                </button>
                <Link to={`/p/${alias}/pack`} className="text-xs text-primary hover:underline">
                  Compose with different scope →
                </Link>
              </div>
              {rebuildError ? (
                <div className="text-xs text-red-700 dark:text-red-300">
                  Rebuild failed: {rebuildError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No context pack yet — run{" "}
          <code className="font-mono">cairndex context "&lt;task&gt;"</code> or compose one above.
        </div>
      )}
    </section>
  );
}
