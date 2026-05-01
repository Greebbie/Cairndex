import type { PackResponse } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  pack: PackResponse;
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

export function ContextPackList({ alias, pack }: Props) {
  const items = pack.frontmatter.items ?? [];
  return (
    <ol className="space-y-3">
      {items.map((it, idx) => {
        const folder = TYPE_TO_FOLDER[it.type];
        return (
          <li
            key={`${idx}-${it.id}`}
            className="rounded border bg-card text-card-foreground p-3"
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground font-mono w-6 text-right">{idx + 1}.</span>
              {folder ? (
                <Link
                  to={`/p/${alias}/browse/${folder}/${it.id}`}
                  className="font-mono text-primary hover:underline"
                >
                  {it.id}
                </Link>
              ) : (
                <span className="font-mono">{it.id}</span>
              )}
              <span className="text-xs text-muted-foreground">[{it.type}]</span>
            </div>
            <div className="text-xs text-muted-foreground ml-9 mt-1">
              <span className="font-medium">reason:</span> {it.reason}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
