import { nodeLink } from "@/lib/nodeLink";
import type { MemoryHealth } from "@/lib/types";
import { useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  health: MemoryHealth;
}

function severityClass(sev: "error" | "warn" | "info"): string {
  if (sev === "error") return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40";
  if (sev === "warn") return "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40";
  return "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40";
}

/**
 * Internal doctor rule keys → human-readable phrasing for the issues list. The
 * raw keys (`freshness`, `confidence-low`, `unverified-done`) only mean something
 * to someone who's read the validate/rules/* source. The dashboard is for the
 * vibe coder, not the rule author.
 */
const RULE_LABELS: Record<string, string> = {
  freshness: "stale",
  "confidence-low": "low confidence",
  "provenance-present": "missing provenance",
  "verification-bound": "missing verification",
  "unverified-done": "marked done without verification",
};

function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule;
}

/**
 * "Vault status" panel — the human framing of what doctor's rules turned up.
 *
 * When everything is green (no warnings, no errors), collapses to a single
 * one-line badge so it doesn't take a full panel of dashboard real estate. The
 * vibe coder doesn't need to be reminded "32 things are healthy" every time
 * they open the page; they need to know when something *isn't*.
 */
export function MemoryHealthPanel({ alias, health }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { red, yellow, green } = health.counts;
  const allGreen = red === 0 && yellow === 0;

  if (allGreen) {
    return (
      <section
        className="rounded border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-1.5 text-sm flex items-center gap-2"
        data-testid="memory-health-badge"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="text-emerald-800 dark:text-emerald-300">
          Vault healthy — {green} note{green === 1 ? "" : "s"}, no issues.
        </span>
      </section>
    );
  }

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Vault status
        </h3>
        {health.issues.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? "Hide issues" : "View issues"}
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          {green} healthy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
          {yellow} stale/warn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          {red} error
        </span>
      </div>
      {expanded && health.issues.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs">
          {health.issues.map((i) => {
            return (
              <li
                key={`${i.nodeId}-${i.rule}`}
                className={`rounded p-2 flex items-start gap-2 ${severityClass(i.severity)}`}
              >
                <span className="font-mono text-[10px] uppercase">{i.severity}</span>
                {i.nodeType ? (
                  <Link
                    to={nodeLink(alias, i.nodeType, i.nodeId)}
                    title={i.nodeId}
                    className="hover:underline"
                  >
                    {i.nodeId}
                  </Link>
                ) : (
                  <span>{i.nodeId}</span>
                )}
                <span className="text-muted-foreground" title={i.rule}>
                  {ruleLabel(i.rule)}
                </span>
                <span className="flex-1">{i.message}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
