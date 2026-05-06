import type { HandoffReadiness } from "@/lib/types";

interface Props {
  readiness: HandoffReadiness;
  onRepair?: () => void;
  repairing?: boolean;
  repairError?: string | null;
}

function toneClass(level: HandoffReadiness["level"]): string {
  switch (level) {
    case "ready":
      return "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100";
    case "attention":
      return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100";
    case "blocked":
      return "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100";
  }
}

function badgeClass(severity: string): string {
  switch (severity) {
    case "blocker":
      return "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200";
    case "warning":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function HandoffReadinessPanel({
  readiness,
  onRepair,
  repairing = false,
  repairError = null,
}: Props) {
  const topChecks = readiness.checks.slice(0, 4);
  return (
    <section className={`rounded border px-4 py-3 space-y-2 ${toneClass(readiness.level)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{readiness.title}</h2>
          <p className="text-sm mt-0.5">{readiness.summary}</p>
        </div>
        <span className="rounded bg-background/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
          {readiness.level}
        </span>
      </div>

      {!readiness.ready && onRepair ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRepair}
            disabled={repairing}
            className="rounded bg-background px-3 py-1 text-xs font-medium text-foreground border disabled:opacity-50"
          >
            {repairing ? "Fixing..." : "Fix safe handoff issues"}
          </button>
          <span className="text-xs text-muted-foreground">
            Syncs safe drift in task state, resume cache, and agent context.
          </span>
        </div>
      ) : null}

      {topChecks.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {topChecks.map((check) => (
            <li key={check.id} className="rounded bg-background/60 px-2 py-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${badgeClass(check.severity)}`}
                >
                  {check.severity}
                </span>
                <span className="font-medium">{check.label}</span>
                <span className="text-muted-foreground">{check.detail}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{check.action}</div>
            </li>
          ))}
        </ul>
      ) : null}

      {readiness.checks.length > topChecks.length ? (
        <div className="text-xs text-muted-foreground">
          {readiness.checks.length - topChecks.length} more readiness check
          {readiness.checks.length - topChecks.length === 1 ? "" : "s"} hidden.
        </div>
      ) : null}

      {repairError ? (
        <div className="text-xs text-red-700 dark:text-red-300">Repair failed: {repairError}</div>
      ) : null}
    </section>
  );
}
