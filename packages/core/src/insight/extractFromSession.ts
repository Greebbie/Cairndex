/**
 * Heuristic insight distillation from a Cairndex session note.
 *
 * Goal: turn the boilerplate session file written by `doctor --auto-session` into a
 * draft *insight proposal* — without an LLM call. The agent or the user reviews the
 * draft in the inbox and accepts/rejects.
 *
 * Heuristics applied (intentionally simple — false positives are cheap because the
 * proposal goes to the inbox, not directly to canonical memory):
 *   - decision-like phrases ("decided to ...", "we chose ...", "agreed to ...")
 *   - repeated ID references (≥2 mentions of the same SPEC/ADR/PLAN/TASK id)
 *   - if neither signal fires, return null — no insight to propose
 */

export interface SessionInsightDraft {
  title: string;
  body: string;
  /** IDs the heuristic considered relevant (used by callers for dedupe / linking). */
  relatedIds: string[];
  /** Reason the heuristic fired, surfaced in the proposal's `reason` field. */
  reason: string;
}

const DECISION_RE =
  /(?:^|\s)(?:we\s+)?(?:decided|agreed|chose|will\s+use|going\s+with|landed\s+on|settled\s+on)\s+(?:to\s+)?([^\.\n]{6,140})/gi;

const ID_RE = /\b([A-Z]{2,}-\d+)\b/g;

/**
 * A captured "decision phrase" looks plausible only if it reads like English prose,
 * not when the regex landed inside code/quotes/regex literals. Garbage signals seen
 * in dogfood: phrases containing pipe `|` (markdown table cells), unmatched `"`
 * (string literal boundaries), or backticks (markdown code spans).
 *
 * The check rejects:
 *   - phrases starting with a non-word character (regex landed mid-token)
 *   - pipe `|` (markdown tables, regex alternations)
 *   - backtick (markdown code spans)
 *   - unmatched double quotes (drift inside JS strings)
 *   - phrases with fewer than 8 letters total (mostly punctuation)
 *
 * Single quotes (apostrophes) are NOT checked — `don't`, `we'll`, `can't` are
 * normal English and getting flagged would silence legitimate decisions.
 */
function looksLikeRealDecisionPhrase(s: string): boolean {
  if (!/^\w/.test(s)) return false;
  if (s.includes("|") || s.includes("`")) return false;
  const dq = (s.match(/"/g) ?? []).length;
  if (dq % 2 !== 0) return false;
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 8) return false;
  return true;
}

function extractDecisionPhrases(text: string): string[] {
  const out: string[] = [];
  DECISION_RE.lastIndex = 0;
  let m: RegExpExecArray | null = DECISION_RE.exec(text);
  while (m !== null) {
    if (m[1]) {
      const phrase = m[1].trim().replace(/[\s,]+$/, "");
      if (looksLikeRealDecisionPhrase(phrase)) out.push(phrase);
    }
    m = DECISION_RE.exec(text);
  }
  return out;
}

function extractIdMentions(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  ID_RE.lastIndex = 0;
  let m: RegExpExecArray | null = ID_RE.exec(text);
  while (m !== null) {
    if (m[1]) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    m = ID_RE.exec(text);
  }
  return counts;
}

function repeatedIds(counts: Map<string, number>, threshold = 2): string[] {
  return Array.from(counts.entries())
    .filter(([, n]) => n >= threshold)
    .map(([id]) => id)
    .sort();
}

function summarizeFirst(phrase: string, max = 80): string {
  if (phrase.length <= max) return phrase;
  return `${phrase.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Run the heuristics against a session body and return a draft, or null when nothing
 * worth proposing was found. The caller is responsible for dedup against existing
 * insights and for actually submitting the proposal.
 */
export function extractInsightFromSessionBody(
  sessionBody: string,
  sessionId: string,
): SessionInsightDraft | null {
  const decisions = extractDecisionPhrases(sessionBody);
  const ids = extractIdMentions(sessionBody);
  const repeats = repeatedIds(ids);

  if (decisions.length === 0 && repeats.length === 0) return null;

  const reasons: string[] = [];
  let titleSeed: string | null = null;

  if (decisions.length > 0) {
    titleSeed = summarizeFirst(decisions[0] ?? "");
    reasons.push(
      `${decisions.length} decision-like phrase${decisions.length === 1 ? "" : "s"} detected`,
    );
  }
  if (repeats.length > 0) {
    if (!titleSeed) titleSeed = `Recurring focus on ${repeats.join(", ")}`;
    reasons.push(`${repeats.length} repeated id reference${repeats.length === 1 ? "" : "s"}`);
  }

  const title = titleSeed ?? `Session ${sessionId} insight`;
  const lines: string[] = [];
  lines.push(`# Insight draft from session ${sessionId}`);
  lines.push("");
  lines.push("> Auto-distilled by `cairndex insight propose-from-session`. Heuristic only — no LLM call. Review carefully before accepting.");
  lines.push("");
  if (decisions.length > 0) {
    lines.push("## Decision-like phrases");
    for (const d of decisions.slice(0, 5)) lines.push(`- ${d}`);
    lines.push("");
  }
  if (repeats.length > 0) {
    lines.push("## Repeated references");
    for (const id of repeats) lines.push(`- ${id} (${ids.get(id) ?? 0} mentions)`);
    lines.push("");
  }
  lines.push("## Source");
  lines.push(`- Session: ${sessionId}`);

  return {
    title,
    body: lines.join("\n"),
    relatedIds: repeats,
    reason: reasons.join("; "),
  };
}
