const CANONICAL_ORDER = [
  "id",
  "title",
  "status",
  "tags",
  "phase",
  "phase_since",
  "next_action",
  "created",
  "updated",
  "supersedes",
  "superseded_by",
  "blocked_by",
  "promoted_to_global",
  "source",
  "answered_by",
  "date",
  "type",
  "target",
  "summary",
  "provenance",
  "links",
  "verification",
];

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((x): x is string => typeof x === "string")
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]+/g, ""),
    )
    .filter((t) => t.length > 0);
  return Array.from(new Set(cleaned));
}

export interface NormalizeOptions {
  refreshTimestamp?: boolean;
  today?: string; // YYYY-MM-DD; defaults to today's date in UTC
}

function todayUtc(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}`;
}

export function normalizeFrontmatter(
  input: Record<string, unknown>,
  opts: NormalizeOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  if ("tags" in out) out.tags = normalizeTags(out.tags);

  if (opts.refreshTimestamp) {
    out.updated = opts.today ?? todayUtc();
  }

  // Sort by canonical order; unknown keys go to the end alphabetically.
  const known = CANONICAL_ORDER.filter((k) => k in out);
  const unknown = Object.keys(out)
    .filter((k) => !CANONICAL_ORDER.includes(k))
    .sort();
  const ordered: Record<string, unknown> = {};
  for (const k of [...known, ...unknown]) ordered[k] = out[k];
  return ordered;
}
