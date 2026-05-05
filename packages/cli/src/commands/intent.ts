import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type IntentRecord,
  activeContextPath,
  clearIntent,
  readIntent,
  vaultExists,
  vaultPath,
  writeIntent,
} from "@cairndex/core";
import kleur from "kleur";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface IntentSetOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  text: string;
  taskId?: string;
  sessionId?: string;
  /** Suppress the banner; default false. */
  silent?: boolean;
}

export interface IntentClearOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Suppress output; default true (Stop hook calls this silently). */
  silent?: boolean;
}

export interface IntentShowOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  json?: boolean;
}

export interface IntentResult {
  exitCode: 0 | 1;
  message?: string;
  body?: string;
  intent?: IntentRecord | null;
}

interface ActiveContextSnapshot {
  currentTask?: { id?: string };
}

function detectTaskId(repoRoot: string): string | null {
  const ctxPath = activeContextPath(repoRoot);
  if (!existsSync(ctxPath)) return null;
  try {
    const raw = readFileSync(ctxPath, "utf8");
    const parsed = JSON.parse(raw) as ActiveContextSnapshot;
    if (parsed?.currentTask?.id) return parsed.currentTask.id;
  } catch {
    // ignore — index may be stale or malformed; don't block intent
  }
  return null;
}

function detectSessionId(): string | null {
  const env = process.env;
  return env.CLAUDE_SESSION_ID ?? env.CAIRNDEX_SESSION_ID ?? env.CLAUDE_CODE_SESSION_ID ?? null;
}

function renderBanner(record: IntentRecord, taskHint: string | null): string {
  const lines: string[] = [];
  const rule = "─".repeat(60);
  lines.push(kleur.cyan(rule));
  const head = taskHint ? `Pre-flight intent · ${taskHint}` : "Pre-flight intent";
  lines.push(kleur.cyan().bold(head));
  if (record.steps.length === 0) {
    lines.push(kleur.dim("  (no steps recorded)"));
  } else {
    record.steps.forEach((step, i) => {
      lines.push(`  ${kleur.cyan(`${i + 1}.`)} ${step}`);
    });
  }
  lines.push(kleur.dim("If this is wrong, interrupt and tell Claude to re-set."));
  lines.push(kleur.cyan(rule));
  return lines.join("\n");
}

export async function runIntentSet(opts: IntentSetOptions): Promise<IntentResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const text = opts.text.trim();
  if (text.length === 0) {
    return { exitCode: 1, message: "intent set requires non-empty <text> (steps separated by ;)" };
  }
  // Guard against pathological input like `";;;"` or `"  ;  ;"` that trims to a non-empty
  // string but parses to zero steps. Without this check `writeIntent` would happily write
  // a frontmatter-only file, and the empty-state IntentBar would mask the failure — the
  // agent thinks it set an intent, the user sees "no pre-flight intent." Hard fail here so
  // the agent gets feedback and re-issues a real intent.
  const previewSteps = text.includes(";") ? text.split(";") : text.split("\n");
  if (previewSteps.map((p) => p.trim()).every((p) => p.length === 0)) {
    return {
      exitCode: 1,
      message:
        "intent set produced zero steps (input was only separators / whitespace). Provide at least one non-empty step.",
    };
  }
  const taskId = opts.taskId ?? detectTaskId(root);
  const sessionId = opts.sessionId ?? detectSessionId();
  const writeOpts: Parameters<typeof writeIntent>[1] = { text };
  if (taskId) writeOpts.taskId = taskId;
  if (sessionId) writeOpts.sessionId = sessionId;
  const record = await writeIntent(root, writeOpts);
  const body = opts.silent ? undefined : renderBanner(record, taskId);
  const result: IntentResult = { exitCode: 0, intent: record };
  if (body !== undefined) result.body = body;
  return result;
}

export async function runIntentClear(opts: IntentClearOptions): Promise<IntentResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    // Stop-hook calls this silently — missing vault should not be an error here.
    if (opts.silent) return { exitCode: 0 };
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const removed = await clearIntent(root);
  if (opts.silent) return { exitCode: 0 };
  return {
    exitCode: 0,
    body: removed ? "intent cleared" : "no active intent",
  };
}

export async function runIntentShow(opts: IntentShowOptions): Promise<IntentResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const intent = await readIntent(root);
  if (opts.json) {
    return { exitCode: 0, body: JSON.stringify(intent, null, 2), intent };
  }
  if (!intent) {
    return { exitCode: 0, body: "no active intent", intent: null };
  }
  // Human-readable: reuse the banner so terminal renders identically to the set step.
  const taskHint = intent.taskId;
  // intent path also useful for debugging
  const path = join(vaultPath(root), "state", "current-intent.md");
  const banner = renderBanner(intent, taskHint);
  return {
    exitCode: 0,
    intent,
    body: `${banner}\n${kleur.dim(`set at ${intent.setAt}`)}\n${kleur.dim(`file:   ${path}`)}`,
  };
}
