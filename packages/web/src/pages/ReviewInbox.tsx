import { ProposalDiff } from "@/components/inbox/ProposalDiff";
import { ProposalPatchView } from "@/components/inbox/ProposalPatchView";
import {
  useAcceptProposal,
  useInbox,
  useNode,
  useRejectProposal,
  useUserPreferences,
} from "@/lib/api";
import { nodeLink } from "@/lib/nodeLink";
import type { Proposal } from "@/lib/types";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

function ProposalBodyView({ alias, p }: { alias: string; p: Proposal }) {
  // create proposals: no current body to diff against — show the new body raw.
  if (p.proposalType === "create") {
    return (
      <pre className="bg-muted/40 rounded p-2 whitespace-pre-wrap break-words">{p.newBody}</pre>
    );
  }
  // update + structured patch: render each op as a labeled block.
  if (p.patch && p.patch.length > 0) {
    return <ProposalPatchView patch={p.patch} />;
  }
  // update + legacy newBody: fetch current target and render a line diff.
  return <UpdateBodyDiff alias={alias} p={p} />;
}

function UpdateBodyDiff({ alias, p }: { alias: string; p: Proposal }) {
  const node = useNode(alias, p.targetType, p.target);
  if (node.isLoading) {
    return <div className="text-muted-foreground p-2">Loading current body…</div>;
  }
  if (node.isError || !node.data) {
    // Fall back to raw newBody when the target can't be loaded (e.g., target deleted).
    return (
      <pre className="bg-muted/40 rounded p-2 whitespace-pre-wrap break-words">{p.newBody}</pre>
    );
  }
  return <ProposalDiff currentBody={node.data.body} newBody={p.newBody} />;
}

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
  const [actionError, setActionError] = useState<string | null>(null);

  const targetLink =
    p.target && p.targetType ? (
      <Link
        to={nodeLink(alias, p.targetType, p.target)}
        className="font-mono text-primary hover:underline"
      >
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
        {p.acceptedBy === "auto" ? (
          <span
            className="text-xs rounded bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5"
            title="Auto-accepted because the proposal's confidence cleared your autoAcceptConfidenceThreshold preference."
          >
            ⚡ auto-accepted
          </span>
        ) : null}
        {p.status !== "pending" ? (
          <span className="ml-auto text-xs text-muted-foreground uppercase">{p.status}</span>
        ) : null}
      </div>
      <div className="text-sm font-medium">{p.summary}</div>
      {p.reason ? <div className="text-xs text-muted-foreground">Reason: {p.reason}</div> : null}
      <div className="text-xs text-muted-foreground">
        Proposed by <span className="font-mono">{p.provenance.createdBy}</span> · session{" "}
        <span className="font-mono">{p.provenance.session}</span>
        {typeof p.provenance.confidence === "number" ? (
          <>
            {" · "}
            <span
              className="font-mono"
              title={
                "Heuristic confidence (0-1). Anything below 0.5 collapses below.\n" +
                "0.60 — decision phrase + repeated IDs both fired\n" +
                "0.50 — decision phrase only (e.g. 'we decided to ship X')\n" +
                "0.40 — legacy default (pre-tier-split proposals); collapsed.\n" +
                "0.25 — repeated IDs only — noisiest tier; collapsed.\n" +
                "Source: extractInsightFromSessionBody (heuristic, no LLM)."
              }
            >
              conf {p.provenance.confidence.toFixed(2)}
            </span>
          </>
        ) : null}
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
        <div className="text-xs overflow-auto max-h-64">
          <ProposalBodyView alias={alias} p={p} />
        </div>
      ) : null}

      {p.status === "pending" ? (
        rejectMode ? (
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
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
                  setActionError(null);
                  try {
                    await onReject(p.proposalId, rejectReason.trim());
                    setRejectMode(false);
                    setRejectReason("");
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : String(err));
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
                onClick={() => {
                  setRejectMode(false);
                  setActionError(null);
                }}
                className="rounded border px-2 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
            {actionError ? (
              <div className="text-xs text-red-700 dark:text-red-300">
                Failed to reject: {actionError}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setActionError(null);
                  try {
                    await onAccept(p.proposalId);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : String(err));
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
                onClick={() => {
                  setRejectMode(true);
                  setActionError(null);
                }}
                className="rounded border px-3 py-1 text-xs"
              >
                Reject
              </button>
            </div>
            {actionError ? (
              <div className="text-xs text-red-700 dark:text-red-300">
                Failed to apply: {actionError}
              </div>
            ) : null}
          </div>
        )
      ) : p.rejectionReason ? (
        <div className="text-xs text-red-700 dark:text-red-300">Rejected: {p.rejectionReason}</div>
      ) : null}
    </article>
  );
}

export default function ReviewInbox() {
  const { alias } = useParams<{ alias: string }>();
  const inbox = useInbox(alias);
  const accept = useAcceptProposal();
  const reject = useRejectProposal();
  const prefs = useUserPreferences();

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

      {typeof prefs.data?.autoAcceptConfidenceThreshold === "number" ? (
        <div
          className="rounded border border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs flex items-center justify-between gap-3"
          data-testid="auto-accept-banner"
        >
          <div>
            ⚡ Auto-accept enabled at{" "}
            <span className="font-mono">
              ≥ {prefs.data.autoAcceptConfidenceThreshold.toFixed(2)}
            </span>{" "}
            confidence — proposals at or above that threshold land in canonical memory without
            review.
          </div>
          <Link to="/settings" className="text-primary hover:underline whitespace-nowrap">
            Settings →
          </Link>
        </div>
      ) : null}

      {inbox.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : inbox.isError ? (
        <div className="text-sm text-red-600">Failed to load inbox.</div>
      ) : inbox.data ? (
        <>
          {(() => {
            // Pending proposals are split twice for review ergonomics:
            //   1. By confidence — noisy auto-distilled drafts (<0.5) collapse
            //      into a folded "Low confidence" disclosure so they don't
            //      crowd out the real signal.
            //   2. Within high-confidence — by proposalType. "create" PROPs are
            //      new directional decisions ("is this a new spec/decision/
            //      insight I want?"); "update" PROPs are edits to existing
            //      content ("does this update reflect intent?"). Different
            //      review questions, different sections.
            //
            // Confidence tiers visible:
            //   * decision-phrase only (0.5)
            //   * decision + ID combined (0.6)
            // Confidence tiers folded:
            //   * legacy 0.4 (pre-tier-split)
            //   * ID-only-recurrence (0.25)
            const LOW_CONFIDENCE = 0.5;
            const isLow = (p: Proposal): boolean =>
              typeof p.provenance.confidence === "number" &&
              p.provenance.confidence < LOW_CONFIDENCE;
            const byConfDesc = (a: Proposal, b: Proposal): number =>
              (b.provenance.confidence ?? 0) - (a.provenance.confidence ?? 0);
            const pendingHigh = inbox.data.pending.filter((p) => !isLow(p));
            const pendingLow = inbox.data.pending.filter(isLow);
            const pendingCreate = pendingHigh
              .filter((p) => p.proposalType === "create")
              .sort(byConfDesc);
            const pendingUpdate = pendingHigh
              .filter((p) => p.proposalType === "update")
              .sort(byConfDesc);
            return (
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Pending ({inbox.data.pending.length})
                </h3>
                {pendingHigh.length === 0 && pendingLow.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No pending proposals. 🎉</div>
                ) : null}

                {pendingCreate.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <span>📥 New content</span>
                      <span className="font-normal lowercase">
                        ({pendingCreate.length} create proposal
                        {pendingCreate.length === 1 ? "" : "s"})
                      </span>
                    </h4>
                    <div className="space-y-3">
                      {pendingCreate.map((p) => (
                        <ProposalCard
                          key={p.proposalId}
                          alias={alias}
                          p={p}
                          onAccept={onAccept}
                          onReject={onReject}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {pendingUpdate.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <span>✏️ Updates</span>
                      <span className="font-normal lowercase">
                        ({pendingUpdate.length} update proposal
                        {pendingUpdate.length === 1 ? "" : "s"})
                      </span>
                    </h4>
                    <div className="space-y-3">
                      {pendingUpdate.map((p) => (
                        <ProposalCard
                          key={p.proposalId}
                          alias={alias}
                          p={p}
                          onAccept={onAccept}
                          onReject={onReject}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {pendingLow.length > 0 ? (
                  <details className="rounded border border-dashed bg-muted/20 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Low confidence ({pendingLow.length}) — auto-distilled, review carefully
                    </summary>
                    <div className="space-y-3 pt-3">
                      {pendingLow.map((p) => (
                        <ProposalCard
                          key={p.proposalId}
                          alias={alias}
                          p={p}
                          onAccept={onAccept}
                          onReject={onReject}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </section>
            );
          })()}

          {inbox.data.accepted.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recently accepted ({inbox.data.accepted.length})
              </h3>
              {inbox.data.accepted.slice(0, 5).map((p) => (
                <ProposalCard
                  key={p.proposalId}
                  alias={alias}
                  p={p}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              ))}
            </section>
          ) : null}

          {inbox.data.rejected.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recently rejected ({inbox.data.rejected.length})
              </h3>
              {inbox.data.rejected.slice(0, 5).map((p) => (
                <ProposalCard
                  key={p.proposalId}
                  alias={alias}
                  p={p}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
