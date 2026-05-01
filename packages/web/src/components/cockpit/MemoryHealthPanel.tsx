import type { MemoryHealth } from "@/lib/types";
import { useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  health: MemoryHealth;
}

const TYPE_TO_FOLDER: Record<string, string> = {
  goal: "goals",
  intent: "intents",
  spec: "specs",
  decision: "decisions",
  plan: "plans",
  task: "tasks",
  session: "sessions",
  change: "changes",
  insight: "insights",
  question: "questions",
};

function severityClass(sev: "error" | "warn" | "info"): string {
  if (sev === "error") return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40";
  if (sev === "warn") return "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40";
  return "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/40";
}

export function MemoryHealthPanel({ alias, health }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { red, yellow, green } = health.counts;
  const issuesByNode = new Map<string, typeof health.issues>();
  for (const i of health.issues) {
    const list = issuesByNode.get(i.nodeId) ?? [];
    list.push(i);
    issuesByNode.set(i.nodeId, list);
  }

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Memory Health
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
            const folder = i.nodeType ? TYPE_TO_FOLDER[i.nodeType] : undefined;
            return (
              <li
                key={`${i.nodeId}-${i.rule}`}
                className={`rounded p-2 flex items-start gap-2 ${severityClass(i.severity)}`}
              >
                <span className="font-mono text-[10px] uppercase">{i.severity}</span>
                {folder ? (
                  <Link
                    to={`/p/${alias}/browse/${folder}/${i.nodeId}`}
                    className="font-mono hover:underline"
                  >
                    {i.nodeId}
                  </Link>
                ) : (
                  <span className="font-mono">{i.nodeId}</span>
                )}
                <span className="text-muted-foreground">{i.rule}</span>
                <span className="flex-1">{i.message}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
