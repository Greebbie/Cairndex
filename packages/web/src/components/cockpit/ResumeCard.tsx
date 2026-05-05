import type { ResumeView } from "@/lib/types";

export interface ResumeCardProps {
  view: ResumeView;
}

/**
 * ResumeCard — "where was I?" surface for vibe-coding sessions.
 *
 * Renders the ResumeView the server builds from vault state: last session,
 * active task, why-context, pending memory, and coverage flags. Design
 * invariant: titles are the headline; typed IDs (TASK-*, INS-*, ADR-*) are
 * demoted to secondary lines or tooltips — matching the rest of the dashboard.
 *
 * Intended for top-of-dashboard placement so the agent's current context is
 * the first thing the human sees when they open the UI.
 */
export function ResumeCard({ view }: ResumeCardProps) {
  const isEmpty = view.lastSession === null && view.activeTask === null;

  return (
    <section
      aria-label="Resume"
      className="rounded border bg-card text-card-foreground p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Resume
      </h3>

      {isEmpty ? (
        <p className="text-sm text-muted-foreground italic">
          No sessions or active tasks yet — start a Claude Code session to populate
          this card.
        </p>
      ) : null}

      {/* Last session */}
      <div className="text-sm space-y-0.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Last session
        </div>
        {view.lastSession !== null ? (
          <div className="leading-snug">
            <span className="font-mono text-xs text-muted-foreground">
              {view.lastSession.id}
            </span>
            {view.lastSession.narrativeStatus === "confirmed" ? (
              <span className="ml-2 text-foreground">{view.lastSession.summary}</span>
            ) : (
              <span className="ml-2 italic text-muted-foreground">unconfirmed</span>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground italic text-sm">no sessions yet</div>
        )}
      </div>

      {/* Active task — title is headline, ID is secondary */}
      <div className="text-sm space-y-0.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Active task
        </div>
        {view.activeTask !== null ? (
          <div className="space-y-0.5">
            <div className="font-medium text-foreground leading-snug">
              {view.activeTask.title}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
              <span title={view.activeTask.id}>{view.activeTask.id}</span>
              <span>{view.activeTask.status}</span>
              <span>{view.activeTask.ageDays}d</span>
            </div>
            {view.activeTask.nextAction !== null ? (
              <div className="text-xs text-foreground/80">
                next: {view.activeTask.nextAction}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground italic text-sm">none</div>
        )}
      </div>

      {/* Why context — only if present; title is headline, ID is secondary */}
      {view.whyContext !== null ? (
        <div className="text-sm space-y-0.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Why
          </div>
          <div className="leading-snug">
            <span className="text-foreground">{view.whyContext.title}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {view.whyContext.kind === "decision" ? "ADR" : "Insight"}{" "}
              {view.whyContext.id}
            </span>
          </div>
        </div>
      ) : null}

      {/* Suggested next — only when distinct from activeTask.nextAction */}
      {view.suggestedNext !== null &&
      view.suggestedNext !== view.activeTask?.nextAction ? (
        <div className="text-sm space-y-0.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Suggested next
          </div>
          <div className="text-foreground">{view.suggestedNext}</div>
        </div>
      ) : null}

      {/* Pending memory */}
      <div className="text-sm space-y-0.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Pending memory
        </div>
        <div className="text-foreground/90">
          {view.pendingMemory.count} pending
        </div>
        {view.pendingMemory.titles.length > 0 ? (
          <ul className="text-xs text-muted-foreground pl-2 space-y-0.5 list-disc list-inside">
            {view.pendingMemory.titles.slice(0, 5).map((title, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional list of short-lived titles
              <li key={i}>{title}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Coverage flags — only if present */}
      {view.coverageFlags.length > 0 ? (
        <div className="text-sm space-y-0.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Coverage flags
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-400 pl-2 space-y-0.5 list-disc list-inside">
            {view.coverageFlags.map((flag, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional list
              <li key={i}>{flag}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
