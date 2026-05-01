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
            ({accepted.length} accepted · {rejected.length} rejected)
          </span>
        </div>
      ) : (
        <div className="text-sm space-y-1">
          <div>
            <span className="font-mono text-amber-700 dark:text-amber-300">{pending.length}</span>{" "}
            pending update{pending.length === 1 ? "" : "s"} from agents
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
