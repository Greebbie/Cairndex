import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendChangelog } from "../changelog.js";
import { loadProjectConfig } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { createProposal, findProposalByCloseoutKey } from "../inbox/create.js";
import { nodeFolderPath, vaultPath } from "../paths.js";
import { buildResumeView } from "../resume/buildResumeView.js";
import { writeResumeCache } from "../resume/cache.js";
import { readActiveTask } from "../resume/readers.js";

export interface CloseOutAnswers {
  didFinish: string;
  decisionOrLearning: string;
  nextStep: string;
}

export interface SubmitCloseOutOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  sessionId: string;
  answers: CloseOutAnswers;
}

export interface SubmitCloseOutResult {
  sessionPath: string;
  taskPath: string | null;
  proposalId: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Replace or append a `## <heading>` section in a markdown body.
 * Matches the heading through end-of-section (next ## or end of doc).
 *
 * The lookahead `(?=\\s|$)` after the heading text prevents a false match when
 * the heading name is a prefix of another heading (e.g. "Next" must not match
 * "## Nextroom").
 */
function upsertSection(body: string, heading: string, value: string): string {
  const pattern = new RegExp(
    `(^## ${heading}(?=\\s|$)\\s*\\n)([\\s\\S]*?)(?=\\n## |$)`,
    "m",
  );
  if (pattern.test(body)) {
    return body.replace(pattern, `$1\n${value}\n`);
  }
  // Append new section
  return body.replace(/\s*$/, "") + `\n\n## ${heading}\n\n${value}\n`;
}

/** Extract the first non-empty line of a multi-line string. */
function firstLine(text: string): string {
  return text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? text.trim();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Persist the three close-out answers into the vault:
 *   1. Session file — updates `summary`, `narrative_status: confirmed`, and
 *      the `## Next` body section.
 *   2. Active task — overwrites `next_action` with the user's nextStep answer
 *      (always reserialised into canonical gray-matter format).
 *   3. Inbox PROP — created when `decisionOrLearning` is non-empty; uses the
 *      canonical `createProposal` writer so `contentHash` and `newFrontmatter`
 *      are populated and the resulting insight can be cleanly accepted later.
 *
 * Idempotency policy: the proposal-create step is keyed on `closeout:<sessionId>`.
 * If `submitCloseOut` is called again for the same session with a non-empty
 * `decisionOrLearning`, the existing proposal is returned unchanged — even if the
 * answer text differs. This prevents an in-flight, not-yet-triaged inbox entry from
 * being overwritten by a session re-confirmation. The session frontmatter and task
 * `next_action` ARE overwritten on every call.
 *
 * If the user wants to correct an already-queued close-out insight, they must
 * reject the existing PROP through the inbox and re-submit close-out (or edit
 * the PROP file directly).
 *
 * @returns `{ sessionPath, taskPath, proposalId }` — `taskPath` is null when no
 *   active task exists; `proposalId` is null when `decisionOrLearning` is empty.
 *   When the idempotency key fires, `proposalId` is the id of the pre-existing PROP.
 */
export async function submitCloseOut(
  opts: SubmitCloseOutOptions,
): Promise<SubmitCloseOutResult> {
  const vault = vaultPath(opts.cwd);

  // 1. Update session file
  const sessionPath = join(vault, "sessions", `${opts.sessionId}.md`);
  const sessionRaw = await readFile(sessionPath, "utf8");
  const { data: sessionData, content: sessionBody } =
    parseFrontmatter<Record<string, unknown>>(sessionRaw);

  const updatedSessionData = {
    ...sessionData,
    summary: opts.answers.didFinish.trim(),
    narrative_status: "confirmed",
  };
  const patchedBody = upsertSection(
    sessionBody,
    "Next",
    opts.answers.nextStep.trim(),
  );
  await writeFile(
    sessionPath,
    serializeFrontmatter(updatedSessionData, patchedBody),
    "utf8",
  );

  // 2. Update active task next_action (always write canonical form; skip only when truly no-op)
  let taskPath: string | null = null;
  const activeTask = await readActiveTask({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });
  if (activeTask !== null) {
    const newNextStep = opts.answers.nextStep.trim();
    // Locate the task file by id. readActiveTask returns an id but not a path, so
    // we scan the tasks directory for a file whose stem starts with the id.
    // (Files may be stored as TASK-001.md or TASK-001-slug.md.)
    const tasksDir = nodeFolderPath(opts.cwd, "tasks");
    let taskFilePath: string | null = null;
    try {
      const entries = await readdir(tasksDir);
      const match = entries.find(
        (e) => e === `${activeTask.id}.md` || e.startsWith(`${activeTask.id}-`),
      );
      if (match) taskFilePath = join(tasksDir, match);
    } catch {
      // tasks dir unreadable — skip task update
    }
    if (taskFilePath === null) {
      // Fallback: derive conventional path (plain id.md)
      taskFilePath = join(tasksDir, `${activeTask.id}.md`);
    }
    const taskRaw = await readFile(taskFilePath, "utf8");
    const { data: taskData, content: taskBody } =
      parseFrontmatter<Record<string, unknown>>(taskRaw);

    const updatedTaskData = {
      ...taskData,
      next_action: newNextStep,
      ...(activeTask.nextAction !== newNextStep
        ? { updated: new Date().toISOString().slice(0, 10) }
        : {}),
    };
    await writeFile(
      taskFilePath,
      serializeFrontmatter(updatedTaskData, taskBody),
      "utf8",
    );
    taskPath = taskFilePath;
  }

  // 3. Optional inbox proposal (only when decisionOrLearning is non-empty)
  let proposalId: string | null = null;
  if (opts.answers.decisionOrLearning.trim().length > 0) {
    const closeoutKey = `closeout:${opts.sessionId}`;

    // Idempotency check — "first close-out wins" policy
    const existing = await findProposalByCloseoutKey(opts.cwd, closeoutKey);
    if (existing !== null) {
      proposalId = existing;
    } else {
      const cfg = loadProjectConfig(opts.cwd);
      const titleText = firstLine(opts.answers.decisionOrLearning).slice(0, 80);
      const result = await createProposal(opts.cwd, cfg, {
        proposalType: "create",
        targetType: "insight",
        summary: titleText,
        reason: "User confirmed a decision or learning at session close-out",
        newBody: opts.answers.decisionOrLearning,
        newFrontmatter: {
          title: titleText,
          status: "draft",
          tags: ["closeout"],
        },
        provenance: {
          createdBy: "close-out",
          session: opts.sessionId,
          confidence: 0.7,
        },
        closeoutKey,
      });
      proposalId = result.proposalId;

      await appendChangelog(
        opts.cwd,
        `Proposed ${proposalId} (close-out insight/${opts.sessionId}): close-out learning captured`,
      );
    }
  }

  // 4. Rebuild resume cache
  const view = await buildResumeView({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });
  await writeResumeCache({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    view,
  });

  return { sessionPath, taskPath, proposalId };
}
