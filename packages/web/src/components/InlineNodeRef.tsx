import { useNode } from "@/lib/api";
import { Fragment, useMemo } from "react";

/**
 * Map a node-id prefix to the durable folder type doctor / vault use. Workflow
 * prefixes (PROP, INBOX, SESSION) intentionally not mapped — they live in the
 * inbox / sessions tree and the resolver leaves them as bare IDs since the
 * "what is X about" question doesn't apply.
 */
const PREFIX_TO_TYPE: Record<string, string> = {
  SPEC: "spec",
  PLAN: "plan",
  TASK: "task",
  GOAL: "goal",
  INS: "insight",
  ADR: "decision",
  DEC: "decision",
  Q: "question",
  INTENT: "intent",
};

function typeFromId(id: string): string | null {
  const dash = id.indexOf("-");
  const prefix = dash > 0 ? id.slice(0, dash) : id;
  return PREFIX_TO_TYPE[prefix] ?? null;
}

interface InlineNodeRefProps {
  alias: string;
  id: string;
}

/**
 * Resolve a node ID inline to its frontmatter title. Falls back to the bare ID
 * when the prefix isn't a durable type (PROP-, INBOX-, etc.) or when the
 * lookup is loading / failed. The original ID stays in the title attribute so
 * power users can still reach the underlying node by hover.
 */
export function InlineNodeRef({ alias, id }: InlineNodeRefProps) {
  const type = typeFromId(id);
  const node = useNode(alias, type ?? undefined, type ? id : undefined);
  if (!type) {
    // Workflow / non-durable id — just print the ID. Tooltip notes why.
    return (
      <span title={`${id} (workflow id — no durable node)`}>{id}</span>
    );
  }
  const title =
    node.data?.frontmatter && typeof (node.data.frontmatter as { title?: unknown }).title === "string"
      ? (node.data.frontmatter as { title: string }).title
      : null;
  return (
    <span title={`${type}/${id}`} className={title ? "italic" : undefined}>
      {title ?? id}
    </span>
  );
}

interface TextWithResolvedIdsProps {
  alias: string;
  text: string;
}

const ID_RE = /\b([A-Z]+-\d+)\b/g;

/**
 * Render a string with any node-id mentions resolved inline to their titles.
 * Splits the text into alternating literal and ID segments, then renders each
 * ID through `<InlineNodeRef>` (which fetches the title via React Query, with
 * the same cache the rest of the dashboard uses).
 *
 * Stable across re-renders because the segment list is derived from `text`
 * via `useMemo` — children of `<InlineNodeRef>` mount in the same order on
 * every render for a given text, so the per-id `useNode` hook order stays
 * stable as React requires.
 */
export function TextWithResolvedIds({ alias, text }: TextWithResolvedIdsProps) {
  const segments = useMemo(() => {
    const out: { kind: "text"; value: string }[] | { kind: "id"; id: string }[] = [];
    const parts: ({ kind: "text"; value: string } | { kind: "id"; id: string })[] = [];
    let lastIndex = 0;
    for (const m of text.matchAll(ID_RE)) {
      const start = m.index ?? 0;
      if (start > lastIndex) {
        parts.push({ kind: "text", value: text.slice(lastIndex, start) });
      }
      parts.push({ kind: "id", id: m[1] ?? "" });
      lastIndex = start + (m[0]?.length ?? 0);
    }
    if (lastIndex < text.length) {
      parts.push({ kind: "text", value: text.slice(lastIndex) });
    }
    void out; // unused — JSX expects parts
    return parts;
  }, [text]);

  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived deterministically from text
          <Fragment key={i}>{s.value}</Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived deterministically from text
          <InlineNodeRef key={i} alias={alias} id={s.id} />
        ),
      )}
    </>
  );
}
