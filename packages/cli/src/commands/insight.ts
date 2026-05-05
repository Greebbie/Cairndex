import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  buildActiveContext,
  centralSharedPath,
  computeProposalHash,
  createSignal,
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
  signalsPath,
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
  const ref =
    input.vaultRoot && input.projectId
      ? resolveProjectRef({
          cwd: input.cwd,
          vaultRoot: input.vaultRoot,
          projectId: input.projectId,
        })
      : resolveProjectRef({ cwd: input.cwd });
  const sharedRoot =
    ref && ref.projectId !== "legacy" ? centralSharedPath(ref.vaultRoot) : sharedDir();
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
  /**
   * Signal id (SIG-NNN) if an auto-distill signal was emitted to `signals/`.
   *
   * Previously this was `proposalId` (PROP-NNN in inbox). Renamed because
   * auto-distill now writes to `signals/`, not `inbox/proposed-memory-updates/`.
   * A future `cairndex signal promote` command turns a signal into an inbox draft.
   */
  signalId?: string;
  /** Path to the signal file in `signals/`, if created. */
  path?: string;
  /**
   * Set when an existing inbox proposal or signal already covers this content.
   * May reference a PROP-NNN (inbox duplicate) or SIG-NNN (signal duplicate).
   */
  duplicateOf?: string;
  /** Reason the heuristic chose to skip — present when no signal was created. */
  skipReason?:
    | "no-signal"
    | "session-missing"
    | "duplicate"
    | "low-confidence"
    | "active-focus-only";
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
    if (
      l &&
      typeof l === "object" &&
      "target" in l &&
      typeof (l as { target: unknown }).target === "string"
    ) {
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

  // Semantic dedupe against existing inbox proposals — a coarse-match key on title
  // (with IDs stripped) plus the sorted set of related-id link targets. Catches the
  // dogfood pattern where each session's auto-distilled draft has a distinct body
  // (different `## Source` line) but is conceptually the same proposal. Includes
  // pending AND rejected — a user who already rejected "Recurring focus on SPEC-X"
  // in the inbox doesn't want the next session to emit a new SIG for it.
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
          message: `insight draft semantically matches inbox proposal ${cand.proposalId}`,
          duplicateOf: cand.proposalId,
          skipReason: "duplicate",
        };
      }
    }
  }

  // Content-hash dedupe against existing inbox proposals. Avoids re-emitting the
  // exact same signal if the Stop hook fires twice in the same session.
  const dup = await findDuplicate(root, cfg, {
    proposalType: "create",
    targetType: "insight",
    newBody: draft.body,
  });
  if (dup) {
    return {
      exitCode: 0,
      message: `insight draft already proposed as inbox proposal ${dup}`,
      duplicateOf: dup,
      skipReason: "duplicate",
    };
  }

  // Content-hash dedupe against existing signal files. Prevents duplicate SIG files
  // when the Stop hook fires more than once without a new session in between.
  const signalsDir = signalsPath(root);
  const existingSignalFiles = existsSync(signalsDir) ? await readdir(signalsDir) : [];
  const draftHash = computeProposalHash({
    proposalType: "create",
    targetType: "insight",
    newBody: draft.body,
  });
  for (const sigFile of existingSignalFiles) {
    if (!sigFile.endsWith(".md")) continue;
    try {
      const sigRaw = await readFile(join(signalsDir, sigFile), "utf8");
      const { data: sigData } = parseFrontmatter<Record<string, unknown>>(sigRaw);
      if (sigData.contentHash === draftHash) {
        const sigId = String(sigData.id ?? sigFile.replace(/\.md$/, ""));
        return {
          exitCode: 0,
          message: `insight draft already emitted as signal ${sigId}`,
          duplicateOf: sigId,
          skipReason: "duplicate",
        };
      }
    } catch {
      // ignore unreadable signal files
    }
  }

  // Emit to signals/ — not inbox. Signals are low-trust automated outputs that
  // require human promotion before they reach canonical memory. No auto-accept path.
  const result = await createSignal(root, {
    source: "auto-distill",
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
      session: sessionId,
      // Conditioned on which signals fired — see extractInsightFromSessionBody.
      confidence: draft.confidence,
    },
  });
  return {
    exitCode: 0,
    signalId: result.signalId,
    path: result.path,
  };
}

export async function runInsightPull(input: InsightCmdInput): Promise<InsightCmdResult> {
  const root = resolveMemoryRoot(input);
  const ref =
    input.vaultRoot && input.projectId
      ? resolveProjectRef({
          cwd: input.cwd,
          vaultRoot: input.vaultRoot,
          projectId: input.projectId,
        })
      : resolveProjectRef({ cwd: input.cwd });
  const sharedRoot =
    ref && ref.projectId !== "legacy" ? centralSharedPath(ref.vaultRoot) : sharedDir();
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
