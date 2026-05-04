import type { Config } from "../config.js";
import { createProposal, findDuplicate } from "../inbox/create.js";
import type { NodeType } from "../types.js";
import { type NodeFile, listNodeFiles } from "../vault.js";

const WIKILINK_RE = /\[\[([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4})\]\]/g;
const ID_RE = /\b([A-Z]+-\d+)\b/g;

/**
 * ID prefixes that represent inbox / workflow metadata, not durable domain entities.
 * Sessions where the agent triages the inbox naturally repeat PROP-* IDs many
 * times — counting those repetitions is what produced the dogfood "Pattern around
 * PROP-XXX" meta-noise (PROP-029, PROP-030 in 2026-05-03). Mirrors the same
 * filter in `insight/extractFromSession.ts` (WORKFLOW_ID_PREFIXES).
 */
const WORKFLOW_ID_PREFIXES = new Set(["PROP", "INBOX", "SESSION"]);

function isWorkflowId(id: string): boolean {
  const dash = id.indexOf("-");
  const prefix = dash > 0 ? id.slice(0, dash) : id;
  return WORKFLOW_ID_PREFIXES.has(prefix);
}

export interface ConsolidateOptions {
  /** Window in days to consider sessions "recent". Default 30. */
  lookbackDays?: number;
  /** Minimum sessions referencing a node before drafting an insight. Default 3. */
  minMentions?: number;
}

export interface ConsolidateResult {
  proposalsCreated: number;
  candidates: Array<{
    target: string;
    mentions: number;
    sessionIds: string[];
    proposalId?: string;
    skipped?: "covered" | "duplicate";
  }>;
}

interface SessionMention {
  sessionId: string;
  date: string;
  summary: string;
  body: string;
}

const MS_PER_DAY = 86_400_000;

function withinWindow(sessionDate: string, lookbackDays: number, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(sessionDate)) return false;
  const d = new Date(sessionDate);
  if (Number.isNaN(d.getTime())) return false;
  const ageDays = (now.getTime() - d.getTime()) / MS_PER_DAY;
  // Future tolerance: session timestamps come in local-day form, so they can read as
  // up to ~1 day in the future relative to UTC. Allow symmetric ±lookbackDays so
  // timezone skew never accidentally drops a real session.
  return Math.abs(ageDays) <= lookbackDays;
}

/**
 * Extract durable node id references from a session — both [[wikilinks]] and bare
 * IDs in body. Workflow / inbox prefixes (PROP-, INBOX-, SESSION-) are filtered
 * out — they're inbox housekeeping, not subject matter, and counting them as
 * "this session is about X" produced the dogfood "Pattern around PROP-XXX"
 * meta-noise. See WORKFLOW_ID_PREFIXES above.
 */
function collectMentions(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(WIKILINK_RE)) {
    if (m[1] && !isWorkflowId(m[1])) out.add(m[1]);
  }
  for (const m of body.matchAll(ID_RE)) {
    if (m[1] && !isWorkflowId(m[1])) out.add(m[1]);
  }
  return out;
}

function extractSessionMention(node: NodeFile): SessionMention | null {
  const date = String(node.frontmatter.date ?? "").slice(0, 10);
  if (!date) return null;
  return {
    sessionId: node.id,
    date,
    summary: String(node.frontmatter.summary ?? ""),
    body: node.body,
  };
}

function buildInsightDraft(
  target: string,
  mentions: SessionMention[],
): { summary: string; body: string; frontmatter: Record<string, unknown> } {
  const today = new Date().toISOString().slice(0, 10);
  const sortedMentions = [...mentions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const oldest = sortedMentions[0];
  const newest = sortedMentions[sortedMentions.length - 1];
  const lines: string[] = [];
  lines.push(`> Auto-drafted from ${mentions.length} sessions touching **${target}**.`);
  lines.push("");
  lines.push("## Sessions");
  for (const m of sortedMentions) {
    lines.push(`- ${m.date} — ${m.sessionId}${m.summary ? `: ${m.summary}` : ""}`);
  }
  lines.push("");
  lines.push(
    "_If this pattern is real, edit and accept the proposal. Otherwise reject — the consolidator will not re-suggest the same body._",
  );
  const summary = `Pattern around ${target} (${mentions.length} sessions, ${oldest?.date ?? "?"} → ${newest?.date ?? "?"})`;
  const frontmatter: Record<string, unknown> = {
    title: `Pattern around ${target}`,
    status: "draft",
    created: today,
    updated: today,
    tags: ["consolidated", target.toLowerCase()],
    provenance: {
      created_by: "cairndex-consolidate",
      session: today,
      confidence: 0.5,
    },
    links: [{ type: "implements", target }],
  };
  return { summary, body: lines.join("\n"), frontmatter };
}

/** True if some existing insight already implements/links to `target`. */
function hasCoveringInsight(target: string, insights: NodeFile[]): boolean {
  for (const ins of insights) {
    const links = ins.frontmatter.links;
    if (Array.isArray(links)) {
      for (const link of links) {
        const t = (link as { target?: unknown }).target;
        if (typeof t === "string" && t === target) return true;
      }
    }
  }
  return false;
}

export async function consolidateRecentSessions(
  repoRoot: string,
  cfg: Config,
  opts: ConsolidateOptions = {},
): Promise<ConsolidateResult> {
  const lookbackDays = opts.lookbackDays ?? 30;
  const minMentions = opts.minMentions ?? 3;
  const now = new Date();

  const sessionFiles = await listNodeFiles(repoRoot, cfg, "session");
  const recent = sessionFiles
    .map(extractSessionMention)
    .filter((m): m is SessionMention => m !== null && withinWindow(m.date, lookbackDays, now));

  // Build target → mentions map.
  const byTarget = new Map<string, SessionMention[]>();
  for (const m of recent) {
    const refs = collectMentions(m.body);
    for (const ref of refs) {
      const list = byTarget.get(ref) ?? [];
      list.push(m);
      byTarget.set(ref, list);
    }
  }

  const insights = await listNodeFiles(repoRoot, cfg, "insight");
  const result: ConsolidateResult = { proposalsCreated: 0, candidates: [] };

  // Stable ordering for reproducible test output.
  const sortedTargets = [...byTarget.keys()].sort();
  for (const target of sortedTargets) {
    const mentions = byTarget.get(target) ?? [];
    if (mentions.length < minMentions) continue;

    if (hasCoveringInsight(target, insights)) {
      result.candidates.push({
        target,
        mentions: mentions.length,
        sessionIds: mentions.map((m) => m.sessionId),
        skipped: "covered",
      });
      continue;
    }

    const draft = buildInsightDraft(target, mentions);
    const targetType: NodeType = "insight";

    const dup = await findDuplicate(repoRoot, cfg, {
      proposalType: "create",
      targetType,
      newBody: draft.body,
    });
    if (dup) {
      result.candidates.push({
        target,
        mentions: mentions.length,
        sessionIds: mentions.map((m) => m.sessionId),
        skipped: "duplicate",
      });
      continue;
    }

    const proposal = await createProposal(repoRoot, cfg, {
      proposalType: "create",
      targetType,
      newBody: draft.body,
      newFrontmatter: draft.frontmatter,
      summary: draft.summary,
      reason: `Auto-consolidated from ${mentions.length} sessions referencing ${target} in the last ${lookbackDays} days.`,
      provenance: {
        createdBy: "cairndex-consolidate",
        session: now.toISOString().slice(0, 10),
        confidence: 0.5,
      },
    });

    result.proposalsCreated += 1;
    result.candidates.push({
      target,
      mentions: mentions.length,
      sessionIds: mentions.map((m) => m.sessionId),
      proposalId: proposal.proposalId,
    });
  }

  return result;
}
