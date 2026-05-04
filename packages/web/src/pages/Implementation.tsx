import { useImplementationLine, useNode, useProjects } from "@/lib/api";
import { nodeLink } from "@/lib/nodeLink";
import { humanizeDateString } from "@/lib/time";
import type { ImplementationLineEntry } from "@/lib/types";
import { Link, Navigate, useParams } from "react-router-dom";

/**
 * Resolve a plan ID to its title via the existing node fetch (cached). Falls back
 * to the bare ID while loading or when the lookup fails. Mirrors the same rule
 * in ReviewInbox: titles are headlines on human surfaces; IDs go in tooltips.
 */
function PlanTitle({ alias, planId }: { alias: string; planId: string }) {
  const node = useNode(alias, "plan", planId);
  const title =
    node.data?.frontmatter &&
    typeof (node.data.frontmatter as { title?: unknown }).title === "string"
      ? (node.data.frontmatter as { title: string }).title
      : null;
  return <span className="italic">{title ?? planId}</span>;
}

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  in_progress: "In progress",
  pending: "Pending",
  blocked: "Blocked",
  archived: "Archived",
};

function statusClass(status: string): string {
  switch (status) {
    case "done":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "in_progress":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
    case "pending":
      return "bg-muted text-muted-foreground";
    case "blocked":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

interface RowProps {
  alias: string;
  entry: ImplementationLineEntry;
}

function Row({ alias, entry }: RowProps) {
  // Show the most informative date for the row's status: completed > updated >
  // created. Done tasks lead with the ship date; in-progress with last touch.
  const stamp = entry.completed ?? entry.updated ?? entry.created ?? "";
  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="py-1.5 pr-3 align-top">
        <Link
          to={nodeLink(alias, "task", entry.taskId)}
          className="font-mono text-primary hover:underline"
        >
          {entry.taskId}
        </Link>
      </td>
      <td className="py-1.5 pr-3 align-top">{entry.title}</td>
      <td className="py-1.5 pr-3 align-top">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${statusClass(entry.status)}`}>
          {STATUS_LABEL[entry.status] ?? entry.status}
        </span>
      </td>
      <td className="py-1.5 pr-3 align-top font-mono text-xs text-muted-foreground" title={stamp}>
        {stamp}
      </td>
      <td className="py-1.5 align-top font-mono text-xs text-muted-foreground">
        {entry.sessionId ?? "—"}
      </td>
    </tr>
  );
}

export default function Implementation() {
  const { alias } = useParams<{ alias: string }>();
  const projects = useProjects();
  const line = useImplementationLine(alias);

  if (!alias) {
    if (projects.data && projects.data.length === 0) return <Navigate to="/onboard" replace />;
    return (
      <div className="p-8 text-sm text-muted-foreground">Pick a project from the sidebar.</div>
    );
  }

  if (line.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading implementation line…</div>;
  }
  if (line.isError) {
    return (
      <div className="p-8 text-sm text-red-600">
        Failed to load implementation line. Run <code>cairndex doctor</code> to diagnose.
      </div>
    );
  }
  const data = line.data;
  if (!data) return null;

  // Build groups in display order: each PLAN-* bucket in the order its first task
  // appears in `entries` (which is already status-sorted), then "(unlinked)" last.
  const entryById = new Map(data.entries.map((e) => [e.taskId, e]));
  const planOrder: string[] = [];
  for (const e of data.entries) {
    const key = e.planId ?? "(unlinked)";
    if (!planOrder.includes(key)) planOrder.push(key);
  }
  // Push "(unlinked)" to the end if present.
  const unlinkedIdx = planOrder.indexOf("(unlinked)");
  if (unlinkedIdx >= 0 && unlinkedIdx !== planOrder.length - 1) {
    planOrder.splice(unlinkedIdx, 1);
    planOrder.push("(unlinked)");
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Implementation</h2>
        <p className="text-sm text-muted-foreground">
          Tasks grouped by plan, in priority order: shipped first (newest), then in progress, then
          pending. Updated{" "}
          <span title={data.generatedAt}>{humanizeDateString(data.generatedAt)}</span>.
        </p>
      </header>

      {data.entries.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No tasks yet. Add one with <code>cairndex inbox propose --target-type task …</code> or via
          the dashboard's Switch picker.
        </div>
      ) : (
        planOrder.map((planKey) => {
          const ids = data.byPlan[planKey] ?? [];
          const groupEntries = ids
            .map((id) => entryById.get(id))
            .filter((e): e is ImplementationLineEntry => !!e);
          if (groupEntries.length === 0) return null;
          return (
            <section key={planKey} className="rounded border bg-card text-card-foreground">
              <header className="flex items-center justify-between px-4 py-2 border-b">
                <div className="text-sm">
                  {planKey === "(unlinked)" ? (
                    <span className="text-muted-foreground italic">
                      Tasks not linked to any plan
                    </span>
                  ) : (
                    <Link
                      to={nodeLink(alias, "plan", planKey)}
                      title={planKey}
                      className="text-primary hover:underline"
                    >
                      <PlanTitle alias={alias} planId={planKey} />
                    </Link>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {groupEntries.length} task{groupEntries.length === 1 ? "" : "s"}
                </div>
              </header>
              <div className="px-4 py-2 overflow-x-auto">
                <table className="w-full text-sm" data-testid={`impl-table-${planKey}`}>
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="py-1.5 pr-3 font-medium">Task</th>
                      <th className="py-1.5 pr-3 font-medium">Title</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                      <th className="py-1.5 pr-3 font-medium">Date</th>
                      <th className="py-1.5 font-medium">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupEntries.map((e) => (
                      <Row key={e.taskId} alias={alias} entry={e} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
