function renderValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined) return <span className="text-muted-foreground italic">—</span>;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground italic">[ ]</span>;
    return (
      <ul className="space-y-0.5">
        {v.map((item, i) => (
          <li key={i} className="text-xs">
            {renderValue(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") {
    return (
      <div className="space-y-0.5 pl-1 border-l border-border/50">
        {Object.entries(v as Record<string, unknown>).map(([k, vv]) => (
          <div key={k} className="flex gap-1.5 text-xs">
            <span className="text-muted-foreground">{k}:</span>
            <span className="break-all">{renderValue(vv)}</span>
          </div>
        ))}
      </div>
    );
  }
  return String(v);
}

export function FrontmatterCard({ data }: { data: Record<string, unknown> }) {
  // Skip 'links' (rendered as Backlinks panel separately) and 'verification' (shown elsewhere).
  const entries = Object.entries(data).filter(([k]) => k !== "links" && k !== "verification");
  return (
    <div className="bg-muted/30 rounded p-3 text-sm space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="text-muted-foreground min-w-24 shrink-0">{k}</span>
          <div className="flex-1 break-all">{renderValue(v)}</div>
        </div>
      ))}
    </div>
  );
}
