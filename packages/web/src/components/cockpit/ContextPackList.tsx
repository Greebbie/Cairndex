import { nodeLink } from "@/lib/nodeLink";
import type { PackResponse } from "@/lib/types";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
  pack: PackResponse;
}

export function ContextPackList({ alias, pack }: Props) {
  const items = pack.frontmatter.items ?? [];
  return (
    <ol className="space-y-3">
      {items.map((it, idx) => {
        return (
          <li key={`${idx}-${it.id}`} className="rounded border bg-card text-card-foreground p-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground font-mono w-6 text-right">{idx + 1}.</span>
              {it.type ? (
                <Link
                  to={nodeLink(alias, it.type, it.id)}
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
