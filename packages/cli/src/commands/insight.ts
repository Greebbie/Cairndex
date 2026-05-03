import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  buildActiveContext,
  centralSharedPath,
  createWithAutoAccept,
  defaultConfig,
  extractInsightFromSessionBody,
  extractTranscriptText,
  findDuplicate,
  listProposals,
  loadProjectConfig,
  parseFrontmatter,
  resolveProjectRef,
  serializeFrontmatter,
  sharedDir,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface InsightCmdInput {
  cwd: string;
  id: string;
  vaultRoot?: string;
  projectId?: string;
}
export interface InsightCmdResult {
  exitCode: 0 | 1;
  message?: string;
}

async function findInsightFile(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  for (const e of entries) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    if (e.startsWith(`${id}-`) || e === `${id}.md`) return join(folder, e);
  }
  return null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runInsightPromote(input: InsightCmdInput): Promise<InsightCmdResult> {
  const root = resolveMemoryRoot(input);
  const ref = input.vaultRoot && input.projectId
    ? resolveProjectRef({ cwd: input.cwd, vaultRoot: input.vaultRoot, projectId: input.projectId })
    : resolveProjectRef({ cwd: input.cwd });
  const sharedRoot = ref && ref.projectId !== "legacy" ? centralSharedPath(ref.vaultRoot) : sharedDir();
  const projectInsightsDir = join(vaultPath(root), defaultConfig().folders.insights);
  const src = await findInsightFile(projectInsightsDir, input.id);
  if (!src) return { exitCode: 1, message: `insight ${input.id} not found in project` };

  const globalInsightsDir = join(sharedRoot, "insights");
  await mkdir(globalInsightsDir, { recursive: true });
  await copyFile(src, join(globalInsightsDir, basename(src)));

  // Mark project copy as promoted
  const raw = await readFile(src, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next = { ...data, promoted_to_global: true };
  await writeFile(src, serializeFrontmatter(next, content), "utf8");

  // Append change event
  const changelog = join(vaultPath(root), "changes/changelog.md");
  await mkdir(join(vaultPath(root), "changes"), { recursive: true });
  await appendFile(
    changelog,
    `- ${todayUtc()} — Promoted ${input.id} to global insights.\n`,
    "utf8",
  );

  return { exitCode: 0 };
}

export interface InsightProposeFromSessionInput {
  cwd: string;
  /** Session id to distill from. When omitted, the latest session by mtime is used. */
  sessionId?: string;
  vaultRoot?: string;
  projectId?: string;
  /** Override createdBy in provenance; default "auto-distill". */
  createdBy?: string;
  /**
   * Optional path to the Claude Code transcript JSONL. When provided, the heuristic
   * also scans the assistant-text content for decision phrases — much richer signal
   * than the session file body alone, which starts as a TODO placeholder.
   */
  transcriptPath?: string;
}

async function findLatestSessionId(sessionsDir: string): Promise<string | null> {
  if (!existsSync(sessionsDir)) return null;
  const entries = await readdir(sessionsDir);
  let latest: string | null = null;
  let latestMtime = 0;
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const { statSync } = await import("node:fs");
      const m = statSync(join(sessionsDir, name)).mtimeMs;
      if (m > latestMtime) {
        latestMtime = m;
        latest = name.replace(/\.md$/, "");
      }
    } catch {
      // ignore unreadable
    }
  }
  return latest;
}

export interface InsightProposeFromSessionResult {
  exitCode: 0 | 1;
  message?: string;
  /** Proposal id, if a draft was produced and proposed. */
  proposalId?: string;
  /** Path to the proposal file, if created. */
  path?: string;
  /** Set when an existing proposal already covers this content. */
  duplicateOf?: string;
  /** Reason the heuristic chose to skip — present when no proposal was created. */
  skipReason?:
    | "no-signal"
    | "session-missing"
    | "duplicate"
    | "low-confidence"
    | "active-focus-only";
  /**
   * True when the user's `autoAcceptConfidenceThreshold` preference fired and
   * the proposal was immediately accepted into canonical memory. The PROP file
   * still exists in the inbox (now in `accepted` status); a durable insight
   * was also created.
   */
  autoAccepted?: boolean;
  /** Set when autoAccepted — the durable target id created (e.g. INS-007). */
  appliedTargetId?: string;
}

/**
 * Minimum heuristic confidence required to actually materialize a proposal in the
 * inbox. The heuristic still emits 0.25 drafts for ID-recurrence-only signals, but
 * those produced pure noise in dogfood (PROP-013/14/15/16/17 were all "Recurring
 * focus on SPEC-X, TASK-Y" with no insight content). Gating at 0.5 means we only
 * propose when at least one decision-like phrase fired.
 */
const MIN_PROPOSAL_CONFIDENCE = 0.5;

/**
 * Coarse-match key for semantic dedupe of insight proposals: lowercase title with
 * any node IDs (e.g. SPEC-001, TASK-007) stripped, whitespace collapsed. Two drafts
 * with the same coarse key + same set of related IDs are "the same insight" even if
 * their bodies differ (e.g. different `## Source - Session: ...` line).
 *
 * Catches the auto-distill noise pattern where every session that mentions the same
 * IDs writes a unique-bodied PROP that the contentHash dedupe couldn't catch.
 */
function coarseInsightKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b[a-z]{2,}-\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function linkTargetSignature(links: unknown): string {
  if (!Array.isArray(links)) return "";
  const targets: string[] = [];
  for (const l of links) {
    if (l && typeof l === "object" && "target" in l && typeof (l as { target: unknown }).target === "string") {
      targets.push((l as { target: string }).target);
    }
  }
  return targets.slice().sort().join(",");
}

/**
 * Heuristic auto-distillation. Reads the named session file, runs the
 * extractInsightFromSessionBody pass, and if any signal fires, drafts an *insight*
 * proposal into the inbox. No LLM call. Designed to be safe to chain off the Stop hook.
 */
export async function runInsightProposeFromSession(
  input: InsightProposeFromSessionInput,
): Promise<InsightProposeFromSessionResult> {
  const root = resolveMemoryRoot(input);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();

  const sessionsDir = join(vaultPath(root), "sessions");
  const sessionId = input.sessionId ?? (await findLatestSessionId(sessionsDir));
  if (!sessionId) {
    return {
      exitCode: 0,
      message: "no sessions found — nothing to distill",
      skipReason: "session-missing",
    };
  }
  const sessionPath = join(sessionsDir, `${sessionId}.md`);
  if (!existsSync(sessionPath)) {
    return {
      exitCode: 0,
      message: `session ${sessionId} not found at ${sessionPath} — nothing to distill`,
      skipReason: "session-missing",
    };
  }

  const raw = await readFile(sessionPath, "utf8");
  const { content } = parseFrontmatter<Record<string, unknown>>(raw);
  // Concatenate the session body and (when available) the transcript text so the
  // heuristic sees decision phrases the agent wrote during the turn — not just the
  // session note's TODO placeholder. Order matters slightly: session body first means
  // a manually-filled session takes priority over raw transcript noise.
  const transcriptText = input.transcriptPath
    ? await extractTranscriptText(input.transcriptPath)
    : "";
  const fullText = transcriptText ? `${content}\n\n${transcriptText}` : content;
  const draft = extractInsightFromSessionBody(fullText, sessionId);
  if (!draft) {
    return {
      exitCode: 0,
      message: `no insight signal in session ${sessionId}`,
      skipReason: "no-signal",
    };
  }
  // Active-focus-only skip. When the *only* signal that fired is "this session
  // mentioned the active spec/plan/task/goal a few times" — that's not new
  // information, just confirmation of where we already are. Always 0.25 confidence
  // (ID-recurrence-only). Decision-phrase signals bypass this because confidence
  // climbs to 0.5 or 0.6 and a phrase-bearing draft is genuine signal even if it's
  // about the active node.
  if (draft.confidence === 0.25 && draft.relatedIds.length > 0) {
    const activeCtx = await buildActiveContext(root, cfg);
    const activeIds = new Set<string>();
    if (activeCtx.activeGoal) activeIds.add(activeCtx.activeGoal.id);
    if (activeCtx.activeSpec) activeIds.add(activeCtx.activeSpec.id);
    if (activeCtx.activePlan) {
      activeIds.add(activeCtx.activePlan.id);
      if (activeCtx.activePlan.currentTaskId) activeIds.add(activeCtx.activePlan.currentTaskId);
    }
    if (activeCtx.currentTask) activeIds.add(activeCtx.currentTask.id);
    if (activeIds.size > 0 && draft.relatedIds.every((id) => activeIds.has(id))) {
      return {
        exitCode: 0,
        message: `insight in session ${sessionId} only confirms current active focus — nothing new to propose`,
        skipReason: "active-focus-only",
      };
    }
  }

  if (draft.confidence < MIN_PROPOSAL_CONFIDENCE) {
    return {
      exitCode: 0,
      message: `insight signal in session ${sessionId} below threshold (confidence ${draft.confidence})`,
      skipReason: "low-confidence",
    };
  }

  // Semantic dedupe — a coarse-match key on title (with IDs stripped) plus the
  // sorted set of related-id link targets. Catches the dogfood pattern where each
  // session's auto-distilled draft has a distinct body (different `## Source` line)
  // but is conceptually the same proposal. The standard contentHash dedupe below
  // would miss these because the body differs. Includes pending AND rejected — a
  // user who already rejected "Recurring focus on SPEC-X" doesn't want the next
  // session to re-propose it.
  const draftLinkSig = draft.relatedIds.slice().sort().join(",");
  const draftCoarse = coarseInsightKey(draft.title);
  if (draftCoarse.length > 0 || draftLinkSig.length > 0) {
    const existing = await listProposals(root, cfg);
    for (const cand of [...existing.pending, ...existing.rejected]) {
      if (cand.targetType !== "insight") continue;
      const candTitle = String(
        (cand.newFrontmatter as Record<string, unknown> | undefined)?.title ?? "",
      );
      const candLinks = (cand.newFrontmatter as Record<string, unknown> | undefined)?.links;
      if (
        coarseInsightKey(candTitle) === draftCoarse &&
        linkTargetSignature(candLinks) === draftLinkSig
      ) {
        return {
          exitCode: 0,
          message: `insight draft semantically matches ${cand.proposalId}`,
          duplicateOf: cand.proposalId,
          skipReason: "duplicate",
        };
      }
    }
  }

  // Dedupe against existing proposals via the standard content-hash check. The signal
  // is intentionally weak (hash of body+target+type) so we mostly use it to avoid
  // re-proposing the same draft if the Stop hook fires twice.
  const dup = await findDuplicate(root, cfg, {
    proposalType: "create",
    targetType: "insight",
    newBody: draft.body,
  });
  if (dup) {
    return {
      exitCode: 0,
      message: `insight draft already proposed as ${dup}`,
      duplicateOf: dup,
      skipReason: "duplicate",
    };
  }

  // Routed through createWithAutoAccept so `autoAcceptConfidenceThreshold` in
  // user prefs gets honored — without this gate the auto-distilled insights
  // would always require manual review even when the user has explicitly
  // raised their trust dial.
  const result = await createWithAutoAccept(root, cfg, {
    proposalType: "create",
    targetType: "insight",
    newFrontmatter: {
      title: draft.title,
      status: "active",
      created: new Date().toISOString().slice(0, 10),
      ...(draft.relatedIds.length > 0
        ? { links: draft.relatedIds.map((id: string) => ({ type: "related", target: id })) }
        : {}),
    },
    newBody: draft.body,
    summary: `Auto-distilled insight: ${draft.title}`,
    reason: draft.reason,
    provenance: {
      createdBy: input.createdBy ?? "auto-distill",
      session: sessionId,
      // Conditioned on which signals fired — see extractInsightFromSessionBody.
      // The inbox UI default-collapses proposals below 0.4 so ID-only matches
      // (which were the noisiest dogfood failures) stay out of the way.
      confidence: draft.confidence,
    },
  });
  return {
    exitCode: 0,
    proposalId: result.proposalId,
    path: result.path,
    autoAccepted: result.autoAccepted,
    ...(result.applied ? { appliedTargetId: result.applied.targetId } : {}),
  };
}

export async function runInsightPull(input: InsightCmdInput): Promise<InsightCmdResult> {
  const root = resolveMemoryRoot(input);
  const ref = input.vaultRoot && input.projectId
    ? resolveProjectRef({ cwd: input.cwd, vaultRoot: input.vaultRoot, projectId: input.projectId })
    : resolveProjectRef({ cwd: input.cwd });
  const sharedRoot = ref && ref.projectId !== "legacy" ? centralSharedPath(ref.vaultRoot) : sharedDir();
  const globalInsightsDir = join(sharedRoot, "insights");
  const src = await findInsightFile(globalInsightsDir, input.id);
  if (!src) return { exitCode: 1, message: `insight ${input.id} not found in global` };

  const projectInsightsDir = join(vaultPath(root), defaultConfig().folders.insights);
  await mkdir(projectInsightsDir, { recursive: true });
  await copyFile(src, join(projectInsightsDir, basename(src)));

  const changelog = join(vaultPath(root), "changes/changelog.md");
  await mkdir(join(vaultPath(root), "changes"), { recursive: true });
  await appendFile(
    changelog,
    `- ${todayUtc()} — Pulled ${input.id} from global insights.\n`,
    "utf8",
  );

  return { exitCode: 0 };
}
