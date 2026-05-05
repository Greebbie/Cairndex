import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../frontmatter.js";
import { readIntent } from "../intent.js";
import { vaultPath } from "../paths.js";
import { readActiveTask } from "../resume/readers.js";
import type { CloseOutAnswers } from "./submit.js";

export interface PrefillCloseOutOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  sessionId: string;
}

/**
 * Produce heuristic-only prefill drafts for the three close-out questions.
 * The user always edits before confirming — this is a starting point, not a claim.
 *
 * Q1 didFinish      — derived from tool-call stats in the session body (if present)
 * Q2 decisionOrLearning — ALWAYS blank (per spec: resist auto-detection)
 * Q3 nextStep       — intent file steps → active task next_action → empty
 *
 * No LLM calls. All reads are best-effort; any missing file yields an empty string.
 */
export async function prefillCloseOut(opts: PrefillCloseOutOptions): Promise<CloseOutAnswers> {
  return {
    didFinish: await prefillDidFinish(opts),
    decisionOrLearning: "", // always blank — see spec rationale
    nextStep: await prefillNextStep(opts),
  };
}

// ---------------------------------------------------------------------------
// Q1 — didFinish
// ---------------------------------------------------------------------------

async function prefillDidFinish(opts: PrefillCloseOutOptions): Promise<string> {
  const sessionPath = join(vaultPath(opts.cwd), "sessions", `${opts.sessionId}.md`);
  if (!existsSync(sessionPath)) return "";

  let raw: string;
  try {
    raw = await readFile(sessionPath, "utf8");
  } catch {
    return "";
  }

  const { content } = parseFrontmatter<Record<string, unknown>>(raw);

  // Heuristic: extract tool counts from a "## Tool calls" section.
  // Expected format: "Edit×N Write×M Bash×K Read×J" (any order, some counts may be 0 or absent).
  const sectionMatch = content.match(/##\s+Tool calls\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (!sectionMatch) return "";

  const statsLine = sectionMatch[1] ?? "";

  const edit = extractCount(statsLine, "Edit");
  const write = extractCount(statsLine, "Write");
  const bash = extractCount(statsLine, "Bash");
  const read = extractCount(statsLine, "Read");

  if (edit === null && write === null && bash === null && read === null) return "";

  const parts: string[] = [];
  if ((edit ?? 0) > 0) {
    const n = edit!;
    parts.push(`${n} file ${n === 1 ? "edit" : "edits"}`);
  }
  if ((write ?? 0) > 0) {
    const n = write!;
    parts.push(`${n} new ${n === 1 ? "file" : "files"}`);
  }
  if ((bash ?? 0) > 0) {
    const n = bash!;
    parts.push(`${n} command${n === 1 ? "" : "s"}`);
  }
  if ((read ?? 0) > 0) {
    const n = read!;
    parts.push(`${n} file ${n === 1 ? "read" : "reads"}`);
  }

  return parts.length > 0 ? `Session activity: ${parts.join(", ")}.` : "";
}

/** Extract a named counter like `Edit×3` or `Edit×0` from a stats line. Returns null when the key is absent. */
function extractCount(line: string, key: string): number | null {
  const m = line.match(new RegExp(`${key}[×x](\\d+)`, "i"));
  if (!m || m[1] === undefined) return null;
  return parseInt(m[1], 10);
}

// ---------------------------------------------------------------------------
// Q3 — nextStep
// ---------------------------------------------------------------------------

async function prefillNextStep(opts: PrefillCloseOutOptions): Promise<string> {
  // 1. Intent file — use the existing readIntent helper from core/intent.ts.
  //    It returns IntentRecord | null; steps is string[].
  //    Join all steps so the user sees the full picture and can trim.
  const intent = await readIntent(opts.cwd);
  if (intent !== null && intent.steps.length > 0) {
    return intent.steps.join("; ");
  }

  // 2. Fall back to active task next_action
  const task = await readActiveTask({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });
  if (task?.nextAction) return task.nextAction;

  // 3. Empty — user fills in
  return "";
}
