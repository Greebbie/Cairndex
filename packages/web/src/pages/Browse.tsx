import { useNodesByType, useTypes, useVaultOverview } from "@/lib/api";
import { useWatcherEvents } from "@/lib/sse";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

function TypeGroup({
  alias,
  type,
  count,
  builtIn,
  initiallyOpen,
}: {
  alias: string;
  type: string;
  count: number;
  builtIn: boolean;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const nodes = useNodesByType(open ? alias : undefined, open ? type : undefined);
  const list = nodes.data ?? [];

  return (
    <li className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 text-muted-foreground">{open ? "▾" : "▸"}</span>
          <span>{type}/</span>
          {!builtIn && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground rounded border border-border px-1">
              custom
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>
      {open && (
        <ul className="pb-2 pl-6">
          {nodes.isLoading && <li className="py-1 text-xs text-muted-foreground">Loading…</li>}
          {nodes.error && <li className="py-1 text-xs text-destructive">Failed to load</li>}
          {!nodes.isLoading && !nodes.error && list.length === 0 && (
            <li className="py-1 text-xs text-muted-foreground">No {type} nodes yet.</li>
          )}
          {list.map((n) => (
            <li key={n.id} className="flex items-center justify-between py-1">
              <Link to={`/p/${alias}/browse/${type}/${n.id}`} className="text-sm hover:underline">
                <span className="font-mono">{n.id}</span>
                {n.title && <span className="text-muted-foreground"> — {n.title}</span>}
              </Link>
              {n.status && <span className="text-xs text-muted-foreground">{n.status}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Browse() {
  const { alias, type } = useParams<{ alias: string; type?: string }>();
  const overview = useVaultOverview(alias);
  const types = useTypes(alias);
  useWatcherEvents(alias);
  const counts = overview.data?.counts ?? {};
  const allTypes = types.data?.types ?? [];

  if (!alias) return <div className="p-8 text-muted-foreground">No project selected.</div>;

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold mb-4">Browse</h2>
      {types.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading types…</div>
      ) : (
        <ul>
          {allTypes.map((t) => (
            <TypeGroup
              key={t.name}
              alias={alias}
              type={t.name}
              count={counts[t.name] ?? 0}
              builtIn={t.builtIn}
              initiallyOpen={type === t.name}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
