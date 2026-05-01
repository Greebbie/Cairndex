import { useAcceptProposal, useInbox, useRejectProposal } from "@/lib/api";
import type { Proposal } from "@/lib/types";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

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

function ProposalCard({
  alias,
  p,
  onAccept,
  onReject,
}: {
  alias: string;
  p: Proposal;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const folder = TYPE_TO_FOLDER[p.targetType];
  const targetLink = p.target && folder ? (
    <Link to={`/p/${alias}/browse/${folder}/${p.target}`} className="font-mono text-primary hover:underline">
      {p.target}
    </Link>
  ) : (
    <span className="font-mono text-muted-foreground">(new)</span>
  );

  return (
    <article className="rounded border bg-card text-card-foreground p-4 space-y-2">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="font-mono text-primary">{p.proposalId}</span>
        <span className="text-xs uppercase tracking-wide text-muted-foreground rounded bg-muted px-1.5 py-0.5">
          {p.proposalType}
        </span>
        <span className="text-xs text-muted-foreground">{p.targetType}/</span>
        {targetLink}
        {p.status !== "pending" ? (
          <span className="ml-auto text-xs text-muted-foreground uppercase">{p.status}</span>
        ) : null}
      </div>
      <div className="text-sm font-medium">{p.summary}</div>
      {p.reason ? <div className="text-xs text-muted-foreground">Reason: {p.reason}</div> : null}
      <div className="text-xs text-muted-foreground">
        Proposed by{" "}
        <span className="font-mono">{p.provenance.createdBy}</span> · session{" "}
        <span className="font-mono">{p.provenance.session}</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setShowBody((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showBody ? "Hide proposed body" : "View proposed body"}
        </button>
        {p.duplicateOf ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            ⓘ duplicate of {p.duplicateOf}
          </span>
        ) : null}
      </div>
      {showBody ? (
        <pre className="text-xs bg-muted/40 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
          {p.newBody}
        </pre>
      ) : null}

      {p.status === "pending" ? (
        rejectMode ? (
          <div className="flex gap-2 pt-2">
            <input
              type="text"
              placeholder="Reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="flex-1 rounded border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={busy || !rejectReason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await onReject(p.proposalId, rejectReason.trim());
                  setRejectMode(false);
                  setRejectReason("");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded bg-red-600 text-white px-2 py-1 text-xs disabled:opacity-50"
            >
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejectMode(false)}
              className="rounded border px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onAccept(p.proposalId);
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded bg-emerald-600 text-white px-3 py-1 text-xs disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              className="rounded border px-3 py-1 text-xs"
            >
              Reject
            </button>
          </div>
        )
      ) : p.rejectionReason ? (
        <div className="text-xs text-red-700 dark:text-red-300">
          Rejected: {p.rejectionReason}
        </div>
      ) : null}
    </article>
  );
}

export default function ReviewInbox() {
  const { alias } = useParams<{ alias: string }>();
  const inbox = useInbox(alias);
  const accept = useAcceptProposal();
  const reject = useRejectProposal();

  if (!alias) return <div className="p-8">No project selected.</div>;

  async function onAccept(proposalId: string) {
    if (!alias) return;
    await accept.mutateAsync({ alias, proposalId });
  }
  async function onReject(proposalId: string, reason: string) {
    if (!alias) return;
    await reject.mutateAsync({ alias, proposalId, reason });
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Review Inbox</h2>
        <Link to={`/p/${alias}`} className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Agent-proposed memory updates queue here. Accept to apply to durable folders; reject to
        archive with a reason.
      </p>

      {inbox.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : inbox.isError ? (
        <div className="text-sm text-red-600">Failed to load inbox.</div>
      ) : inbox.data ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Pending ({inbox.data.pending.length})
            </h3>
            {inbox.data.pending.length === 0 ? (
              <div className="text-sm text-muted-foreground">No pending proposals. 🎉</div>
            ) : (
              inbox.data.pending.map((p) => (
                <ProposalCard key={p.proposalId} alias={alias} p={p} onAccept={onAccept} onReject={onReject} />
              ))
            )}
          </section>

          {inbox.data.accepted.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recently accepted ({inbox.data.accepted.length})
              </h3>
              {inbox.data.accepted.slice(0, 5).map((p) => (
                <ProposalCard key={p.proposalId} alias={alias} p={p} onAccept={onAccept} onReject={onReject} />
              ))}
            </section>
          ) : null}

          {inbox.data.rejected.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recently rejected ({inbox.data.rejected.length})
              </h3>
              {inbox.data.rejected.slice(0, 5).map((p) => (
                <ProposalCard key={p.proposalId} alias={alias} p={p} onAccept={onAccept} onReject={onReject} />
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
