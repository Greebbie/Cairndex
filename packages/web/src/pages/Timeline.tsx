import { useChanges } from "@/lib/api";
import { humanizeChangelogSummary, isSessionReceipt } from "@/lib/changelogFormat";
import { useWatcherEvents } from "@/lib/sse";
import { humanizeDateString } from "@/lib/time";
import { useState } from "react";
import { useParams } from "react-router-dom";

export default function Timeline() {
  const { alias } = useParams<{ alias: string }>();
  const changes = useChanges(alias);
  useWatcherEvents(alias);
  // Off by default — most people opening the timeline want the narrative,
  // not the raw "Session ... recorded (Edit×N Write×N ...)" receipts. The
  // receipts are still in the changelog file for forensic use; this toggle
  // brings them back into the view when needed.
  const [showSessionReceipts, setShowSessionReceipts] = useState(false);

  if (changes.isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (changes.error)
    return (
      <div className="p-8 text-destructive">Error loading timeline: {String(changes.error)}</div>
    );
  if (!changes.data) return null;

  const all = changes.data.events;
  const filtered = showSessionReceipts ? all : all.filter((e) => !isSessionReceipt(e.summary));
  const hiddenReceiptCount = all.length - filtered.length;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-xl font-semibold">Timeline</h2>
        <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showSessionReceipts}
            onChange={(e) => setShowSessionReceipts(e.target.checked)}
            className="rounded"
          />
          Show session receipts
          {hiddenReceiptCount > 0 && !showSessionReceipts ? (
            <span className="text-muted-foreground/70">({hiddenReceiptCount} hidden)</span>
          ) : null}
        </label>
      </div>
      <ul className="space-y-2">
        {filtered.map((e, i) => {
          // Receipts go through unmodified when the user opted to show them
          // (they're audit data, not narrative — humanizing them would be
          // misleading). Narrative events get the headline-vs-ID lift.
          const isReceipt = isSessionReceipt(e.summary);
          const h = isReceipt ? { text: e.summary, tooltip: e.summary } : humanizeChangelogSummary(e.summary);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: server-stable order
              key={i}
              className="flex gap-3 text-sm border-b border-border pb-2"
            >
              <span
                className="text-xs text-muted-foreground min-w-24 font-mono"
                title={e.date}
              >
                {humanizeDateString(e.date)}
              </span>
              <span
                className={isReceipt ? "text-muted-foreground italic flex-1" : "flex-1"}
                title={h.tooltip}
              >
                {h.text}
              </span>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="text-muted-foreground">
            {hiddenReceiptCount > 0
              ? `No narrative events. ${hiddenReceiptCount} session receipt${hiddenReceiptCount === 1 ? "" : "s"} hidden — toggle above to show them.`
              : "No events yet."}
          </li>
        )}
      </ul>
    </div>
  );
}
