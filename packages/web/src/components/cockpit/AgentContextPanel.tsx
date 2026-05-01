import type { Dashboard } from "@/lib/types";
import { Link } from "react-router-dom";

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
  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Agent Context
        </h3>
        <Link
          to={`/p/${alias}/pack`}
          className="text-xs text-primary hover:underline"
        >
          Compose new pack →
        </Link>
      </div>
      {latest ? (
        <div className="text-sm space-y-1">
          <div>
            Last pack:{" "}
            <Link
              to={`/p/${alias}/pack/${latest.id}`}
              className="font-mono text-primary hover:underline"
            >
              {latest.id}
            </Link>
          </div>
          <div className="text-xs text-muted-foreground">
            Built {fmtDate(latest.builtAt)}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          No context pack yet — run <code className="font-mono">cairndex context "&lt;task&gt;"</code> or compose one above.
        </div>
      )}
    </section>
  );
}
