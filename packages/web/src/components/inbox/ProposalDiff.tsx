import { diffLines } from "diff";

interface Props {
  currentBody: string;
  newBody: string;
}

const MAX_DIFF_BYTES = 100_000;

export function ProposalDiff({ currentBody, newBody }: Props) {
  const totalBytes = currentBody.length + newBody.length;
  if (totalBytes > MAX_DIFF_BYTES) {
    return (
      <div className="text-xs rounded border bg-muted/40 p-2 text-muted-foreground">
        Diff is too large to render inline ({Math.round(totalBytes / 1024)} KB). Open the target
        file directly to compare, or reject this proposal and review the diff externally.
      </div>
    );
  }
  const changes = diffLines(currentBody, newBody);
  return (
    <pre className="text-xs whitespace-pre-wrap break-words rounded border bg-muted/40 p-2 font-mono">
      {changes.map((part, idx) => {
        const tag = part.added ? "a" : part.removed ? "r" : "c";
        const key = `${idx}-${tag}`;
        if (part.added) {
          return (
            <span
              key={key}
              className="block bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            >
              {prefixLines(part.value, "+ ")}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span key={key} className="block bg-red-500/15 text-red-700 dark:text-red-300">
              {prefixLines(part.value, "- ")}
            </span>
          );
        }
        return (
          <span key={key} className="block text-muted-foreground">
            {prefixLines(part.value, "  ")}
          </span>
        );
      })}
    </pre>
  );
}

function prefixLines(value: string, prefix: string): string {
  // Preserve a trailing newline so consecutive blocks render on their own lines.
  const trailing = value.endsWith("\n");
  const lines = (trailing ? value.slice(0, -1) : value).split("\n");
  return lines.map((l) => prefix + l).join("\n") + (trailing ? "\n" : "");
}
