import { cn } from "@/lib/utils";

const PHASES = [
  "discovering",
  "specifying",
  "planning",
  "implementing",
  "reviewing",
  "shipping",
] as const;

export function PhaseTracker({ phase }: { phase: string | null }) {
  return (
    <div className="flex gap-1 items-center">
      {PHASES.map((p) => (
        <span
          key={p}
          className={cn(
            "px-2 py-1 rounded text-xs",
            p === phase ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {p}
        </span>
      ))}
    </div>
  );
}
