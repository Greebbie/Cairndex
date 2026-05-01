import { useDoctor } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DoctorBadge({ alias }: { alias: string }) {
  const { data, isLoading } = useDoctor(alias);
  if (isLoading) return <span className="text-xs text-muted-foreground">checking…</span>;
  const issues = data?.issues ?? [];
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  return (
    <div className="flex gap-2 items-center">
      <span
        className={cn(
          "px-2 py-1 rounded text-xs",
          errors > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted",
        )}
      >
        {errors} error{errors === 1 ? "" : "s"}
      </span>
      <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">
        {warns} warning{warns === 1 ? "" : "s"}
      </span>
    </div>
  );
}
