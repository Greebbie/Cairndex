import { useInbox } from "@/lib/api";
import { Link } from "react-router-dom";

interface Props {
  alias: string;
}

export function InboxPanel({ alias }: Props) {
  const inbox = useInbox(alias);
  const pending = inbox.data?.pending ?? [];
  const accepted = inbox.data?.accepted ?? [];
  const rejected = inbox.data?.rejected ?? [];

  // Split pending count by proposalType so the dashboard hint mirrors the
  // ReviewInbox grouping. Different review questions for "new content" vs
  // "updates to existing content" — surfacing the split here lets the user
  // gauge "how much new direction is queued" at a glance.
  const newCount = pending.filter((p) => p.proposalType === "create").length;
  const updateCount = pending.filter((p) => p.proposalType === "update").length;
  const autoCount = accepted.filter((p) => p.acceptedBy === "auto").length;

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Review Inbox
        </h3>
        <Link to={`/p/${alias}/inbox`} className="text-xs text-primary hover:underline">
          Open inbox →
        </Link>
      </div>
      {inbox.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No pending proposals.{" "}
          <span className="text-xs">
            ({accepted.length} accepted
            {autoCount > 0 ? ` · ${autoCount} auto` : ""} · {rejected.length} rejected)
          </span>
        </div>
      ) : (
        <div className="text-sm space-y-1">
          <div>
            <span className="font-mono text-amber-700 dark:text-amber-300">{pending.length}</span>{" "}
            pending update{pending.length === 1 ? "" : "s"} from agents
            <span className="text-xs text-muted-foreground">
              {" "}
              ({newCount} new · {updateCount} update{updateCount === 1 ? "" : "s"})
            </span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {pending.slice(0, 3).map((p) => (
              <li key={p.proposalId}>
                <Link to={`/p/${alias}/inbox`} className="font-mono text-primary hover:underline">
                  {p.proposalId}
                </Link>{" "}
                — {p.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
