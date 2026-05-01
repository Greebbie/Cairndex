interface Props {
  used: number;
  budget: number;
  trimmed?: number;
}

export function TokenBar({ used, budget, trimmed = 0 }: Props) {
  const safeBudget = Math.max(1, budget);
  const pct = Math.min(100, Math.round((used / safeBudget) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Token estimate: <span className="font-mono">{used}</span> /{" "}
          <span className="font-mono">{budget}</span> ({pct}%)
        </span>
        {trimmed > 0 ? <span>{trimmed} item(s) trimmed</span> : null}
      </div>
      <div className="h-2 w-full rounded bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
