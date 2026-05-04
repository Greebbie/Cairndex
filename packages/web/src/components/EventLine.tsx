import { TextWithResolvedIds } from "@/components/InlineNodeRef";
import { useNode } from "@/lib/api";
import type { CollapsedEvent, EventTargetRef } from "@/lib/changelogFormat";

interface ResolvedTitleProps {
  alias: string;
  target: EventTargetRef;
  /** Italic by default — caller can suppress when nesting inside an italic block. */
  italic?: boolean;
}

/**
 * Resolve a node ref to its frontmatter title. Falls back to the bare ID while
 * loading or when the lookup fails. Used to turn "INS-008" into the actual
 * insight headline ("Recurring focus on SPEC-001") in changelog rows.
 */
function ResolvedTitle({ alias, target, italic = true }: ResolvedTitleProps) {
  const node = useNode(alias, target.type, target.id);
  const title =
    node.data?.frontmatter &&
    typeof (node.data.frontmatter as { title?: unknown }).title === "string"
      ? (node.data.frontmatter as { title: string }).title
      : null;
  const text = title ?? target.id;
  return (
    <span className={italic ? "italic" : undefined} title={`${target.type}/${target.id}`}>
      {text}
    </span>
  );
}

interface EventLineProps {
  alias: string;
  event: CollapsedEvent;
}

/**
 * Render one row from `foldChangelogForDisplay`. Three shapes:
 *
 *  1. Plain event — display the humanized text directly.
 *  2. Singleton routing — "Accepted: <resolved title> (insight)" instead of
 *     "Accepted PROP-X → created insight/INS-Y". The original PROP/INS IDs go
 *     in tooltip for traceability.
 *  3. Collapsed batch — "21 proposals accepted (incl. <title>, <title>, <title>)"
 *     so the user sees what was batched, not just a routing-id flood.
 *
 * The `useNode` calls are React Query–cached: the same INS-008 referenced in
 * many rows hits the cache after the first fetch, so per-row resolution stays
 * cheap even on a 20-row turn.
 */
export function EventLine({ alias, event }: EventLineProps) {
  if (event.routing) {
    const verb = event.routing.verb;
    if (event.routing.target) {
      return (
        <span title={event.tooltip}>
          {verb}: <ResolvedTitle alias={alias} target={event.routing.target} /> (
          {event.routing.target.type})
        </span>
      );
    }
    return <span title={event.tooltip}>{verb} a proposal (no resulting node recorded)</span>;
  }
  if (event.batch) {
    const { accepts, rejects, sampleTargets } = event.batch;
    const verbParts: string[] = [];
    if (accepts > 0) verbParts.push(`${accepts} accepted`);
    if (rejects > 0) verbParts.push(`${rejects} rejected`);
    return (
      <span title={event.tooltip}>
        <strong>{event.count}</strong> proposals batch-routed ({verbParts.join(" · ")})
        {sampleTargets.length > 0 ? (
          <>
            {" "}
            — incl.{" "}
            {sampleTargets.map((t, i) => (
              <span key={`${t.type}-${t.id}`}>
                <ResolvedTitle alias={alias} target={t} />
                {i < sampleTargets.length - 1 ? ", " : ""}
              </span>
            ))}
            {event.count > sampleTargets.length ? ", …" : ""}
          </>
        ) : null}
      </span>
    );
  }
  // Fallback shape: a plain humanized event line. The text body may still embed
  // bare node IDs ("Agent suggested an insight: Recurring focus on SPEC-001") —
  // resolve them inline so the user sees titles, not codes.
  return (
    <span title={event.tooltip}>
      <TextWithResolvedIds alias={alias} text={event.text} />
    </span>
  );
}
