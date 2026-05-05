import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { vaultPath } from "./paths.js";

export const INTENT_FILE = "current-intent.md";
export const INTENT_STATE_DIR = "state";
export const INTENT_MAX_STEPS = 3;
export const INTENT_MAX_STEP_CHARS = 80;

export interface IntentRecord {
  setAt: string;
  taskId: string | null;
  sessionId: string | null;
  steps: string[];
}

interface IntentFrontmatter {
  set_at?: string;
  task_id?: string | null;
  session_id?: string | null;
}

export interface WriteIntentInput {
  text: string;
  taskId?: string | null;
  sessionId?: string | null;
  /** Override Date.now() for deterministic tests. */
  now?: number;
}

export function intentFilePath(repoRoot: string): string {
  return join(vaultPath(repoRoot), INTENT_STATE_DIR, INTENT_FILE);
}

function splitSteps(rawText: string): string[] {
  const parts = rawText.includes(";") ? rawText.split(";") : rawText.split("\n");
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, INTENT_MAX_STEPS);
}

function clampStep(step: string): string {
  // Iterate by code point (Array.from on a string yields characters by code point,
  // not UTF-16 code unit) so surrogate pairs (emoji, supplementary-plane CJK) are
  // counted as one character and never bisected mid-pair. This is one level coarser
  // than full grapheme segmentation (no combining marks, ZWJ sequences), which is
  // acceptable for short agent-authored steps but documented here as a known limit.
  const chars = Array.from(step);
  if (chars.length <= INTENT_MAX_STEP_CHARS) return step;
  return `${chars.slice(0, INTENT_MAX_STEP_CHARS - 1).join("")}…`;
}

function parseSteps(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0);
}

export async function writeIntent(
  repoRoot: string,
  input: WriteIntentInput,
): Promise<IntentRecord> {
  const setAt = new Date(input.now ?? Date.now()).toISOString();
  const steps = splitSteps(input.text).map(clampStep);
  const taskId = input.taskId ?? null;
  const sessionId = input.sessionId ?? null;

  const fm: Record<string, unknown> = { set_at: setAt };
  if (taskId) fm.task_id = taskId;
  if (sessionId) fm.session_id = sessionId;

  const body = steps.map((s) => `- ${s}`).join("\n");
  const out = serializeFrontmatter(fm, body.length > 0 ? `${body}\n` : "");

  const filePath = intentFilePath(repoRoot);
  await mkdir(join(vaultPath(repoRoot), INTENT_STATE_DIR), { recursive: true });
  // Atomic write: stage to a sibling `.tmp` and rename into place. `rename` is atomic
  // for same-directory moves on every supported FS (NTFS, APFS, ext4), so a SIGINT or
  // power loss between the two steps leaves the previous version intact rather than a
  // half-written frontmatter that `readIntent` would treat as corrupt.
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, out, "utf8");
  await rename(tmpPath, filePath);

  return { setAt, taskId, sessionId, steps };
}

export async function readIntent(repoRoot: string): Promise<IntentRecord | null> {
  const filePath = intentFilePath(repoRoot);
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  const { data, content } = parseFrontmatter<IntentFrontmatter>(raw);
  if (!data || typeof data.set_at !== "string") return null;
  return {
    setAt: data.set_at,
    taskId: typeof data.task_id === "string" ? data.task_id : null,
    sessionId: typeof data.session_id === "string" ? data.session_id : null,
    steps: parseSteps(content),
  };
}

export async function clearIntent(repoRoot: string): Promise<boolean> {
  const filePath = intentFilePath(repoRoot);
  if (!existsSync(filePath)) return false;
  try {
    await rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}
