import { useImplementationLine } from "@/lib/api";
import { nodeLink } from "@/lib/nodeLink";
import type { ProjectState } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  state: ProjectState;
}

/**
 * Compact "plan progress" panel for the dashboard. Surfaces:
 *   - Done / in-progress / pending counts for the *active plan*.
 *   - The 3 most recently completed tasks, with session links.
 *   - A link to the full Implementation page for the chronological view.
 *
 * Renders nothing when there is no active plan and no implementation entries —
 * the dashboard already has a row for "no active plan" via ProjectStatePanel.
 */
export function ActivePlanPanel({ alias, state }: Props) {
  const line = useImplementationLine(alias);

  // Need an active plan to scope by; if none, render only when there are entries
  // overall so the user still sees a window into "what's been done."
  const activePlanId = state.activePlan?.id ?? null;
  const allEntries = line.data?.entries ?? [];
  if (!activePlanId && allEntries.length === 0) return null;

  // Filter to the active plan when we have one; otherwise show the whole line
  // (this panel is mostly useful while a plan is active, so the fallback is rare).
  const planEntries = activePlanId
    ? allEntries.filter((e) => e.planId === activePlanId)
    : allEntries;

  const done = planEntries.filter((e) => e.status === "done");
  const inProgress = planEntries.filter((e) => e.status === "in_progress");
  const pending = planEntries.filter((e) => e.status === "pending");
  const total = planEntries.length;
  const pctDone = total === 0 ? 0 : Math.round((done.length / total) * 100);

  const recentDone = done.slice(0, 3); // entries are already done-newest-first

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Plan progress
        </h3>
        <Link to={`/p/${alias}/implementation`} className="text-xs text-primary hover:underline">
          Full implementation line →
        </Link>
      </div>

      {activePlanId ? (
        <div className="text-sm">
          <Link
            to={nodeLink(alias, "plan", activePlanId)}
            title={activePlanId}
            className="italic text-foreground hover:underline"
          >
            {state.activePlan?.title ?? activePlanId}
          </Link>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground italic">
          No active plan — showing all tasks
        </div>
      )}

      {total === 0 ? (
        <div className="text-sm text-muted-foreground">
          No tasks linked to this plan yet — pick one with the Switch action in Project State above.
        </div>
      ) : (
        <>
          {/* Progress bar — done / total — with the three buckets summarized inline. */}
          <div className="space-y-1">
            <div className="h-2 w-full bg-muted rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pctDone}%` }}
                role="progressbar"
                aria-valuenow={pctDone}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${pctDone}% of plan tasks done`}
                tabIndex={0}
              />
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
              <span>
                <span className="font-semibold text-foreground">{done.length}</span> done
              </span>
              <span>
                <span className="font-semibold text-foreground">{inProgress.length}</span> in
                progress
              </span>
              <span>
                <span className="font-semibold text-foreground">{pending.length}</span> pending
              </span>
              <span className="ml-auto">{pctDone}%</span>
            </div>
          </div>

          {recentDone.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Recently shipped</div>
              <ul className="text-sm space-y-1">
                {recentDone.map((e) => (
                  <li key={e.taskId} className="flex gap-2 items-baseline">
                    <Link
                      to={nodeLink(alias, "task", e.taskId)}
                      className="font-mono text-primary hover:underline shrink-0"
                    >
                      {e.taskId}
                    </Link>
                    <span className="flex-1 truncate">{e.title}</span>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {e.completed ?? e.updated}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
