import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { appendChangelog } from "../changelog.js";
import type { Config } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { nextSequentialId } from "../ids.js";
import { buildActiveContext } from "../indexes/activeContext.js";
import { indexPath } from "../paths.js";
import { type NodeFile, listNodeFiles, listNodeIds, writeNode } from "../vault.js";

/**
 * Workflow-state mutations that intentionally bypass the inbox.
 *
 * Cairndex's inbox-first principle ("never edit canonical files directly") is about
 * **content** changes — new specs, decisions, insights, body edits. **Workflow state
 * advancement** — switching the current task, marking one done, advancing the phase —
 * is an ergonomic loop the agent and user run constantly during a session. Forcing it
 * through propose-and-accept would add a round trip to the most frequent operation in
 * the loop, so these helpers write directly. Each one writes a changelog line so the
 * mutation is still auditable from the recent-activity view.
 *
 * Errors are thrown — callers (CLI, server route) translate to user-facing messages.
 */

export interface TaskMutationResult {
  /** Task IDs whose status changed, with what they changed from→to. */
  changed: Array<{ id: string; from: string; to: string }>;
  /** Single-line summary written to the changelog. */
  summary: string;
}

export interface CreateTaskInput {
  title: string;
  nextAction?: string;
}

export interface CreateTaskResult {
  id: string;
  path: string;
  summary: string;
}

export interface TaskNextActionResult {
  id: string;
  from: string | null;
  to: string;
  path: string;
  changed: boolean;
  summary: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "task"
  );
}

async function writeFrontmatter(
  node: NodeFile,
  patch: Record<string, unknown>,
): Promise<{ from: string; to: string }> {
  const merged = { ...node.frontmatter, ...patch };
  const next = serializeFrontmatter(merged, node.body);
  await writeFile(node.path, next, "utf8");
  const from = String(node.frontmatter.status ?? "");
  const to = String(merged.status ?? from);
  return { from, to };
}

async function writeIndexCurrentTask(
  repoRoot: string,
  taskId: string | null,
  onlyIfCurrentTask?: string,
): Promise<void> {
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return;
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  if (
    onlyIfCurrentTask &&
    typeof data.current_task === "string" &&
    data.current_task !== onlyIfCurrentTask
  ) {
    return;
  }
  if (taskId) data.current_task = taskId;
  else delete data.current_task;
  await writeFile(path, serializeFrontmatter(data, content), "utf8");
}

async function writeIndexNextAction(repoRoot: string, nextAction: string | null): Promise<void> {
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return;
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  if (nextAction && nextAction.trim()) data.next_action = nextAction.trim();
  else delete data.next_action;
  await writeFile(path, serializeFrontmatter(data, content), "utf8");
}

/**
 * Create a pending task directly in the workflow loop. This is state scaffolding,
 * not a durable insight/body edit, so it follows the same direct-mutation policy as
 * task switch / complete and writes a changelog entry for auditability.
 */
export async function createTask(
  repoRoot: string,
  cfg: Config,
  input: CreateTaskInput,
): Promise<CreateTaskResult> {
  const title = input.title.trim();
  if (!title) throw new Error("task title must be non-empty");

  const existingIds = await listNodeIds(repoRoot, cfg, "task");
  const id = nextSequentialId("TASK", existingIds);
  const today = todayUtc();
  const frontmatter: Record<string, unknown> = {
    id,
    title,
    status: "pending",
    created: today,
    updated: today,
    provenance: {
      created_by: "workflow",
      session: "manual",
    },
  };
  const nextAction = input.nextAction?.trim();
  if (nextAction) frontmatter.next_action = nextAction;

  const path = await writeNode(repoRoot, cfg, "task", {
    frontmatter,
    body: `# ${title}\n\n## Notes\n\n`,
    slug: slugify(title),
  });
  const summary = `task create -> ${id}`;
  await appendChangelog(repoRoot, summary);
  return { id, path, summary };
}

export async function setTaskNextAction(
  repoRoot: string,
  cfg: Config,
  taskId: string,
  nextAction: string,
): Promise<TaskNextActionResult> {
  const value = nextAction.trim();
  if (!value) throw new Error("next action must be non-empty");

  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const target = tasks.find((t) => t.id === taskId);
  if (!target) {
    throw new Error(
      `task ${taskId} not found - known ids: ${tasks.map((t) => t.id).join(", ") || "(none)"}`,
    );
  }

  const from =
    typeof target.frontmatter.next_action === "string" ? target.frontmatter.next_action : null;
  const changed = from !== value;
  if (changed) {
    await writeFrontmatter(target, { next_action: value, updated: todayUtc() });
  }
  await writeIndexNextAction(repoRoot, value);
  const summary = changed
    ? `task next_action -> ${taskId}`
    : `task next_action unchanged -> ${taskId}`;
  await appendChangelog(repoRoot, summary);
  return { id: taskId, from, to: value, path: target.path, changed, summary };
}

/**
 * Make `taskId` the current in-progress task. Demotes any other task that was
 * `in_progress` to `pending` so the active-context picker has an unambiguous answer.
 *
 * Throws if `taskId` is unknown to the project, or if the task is already `done` /
 * `archived` (caller should explicitly re-open before switching).
 */
export async function switchTask(
  repoRoot: string,
  cfg: Config,
  taskId: string,
): Promise<TaskMutationResult> {
  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const target = tasks.find((t) => t.id === taskId);
  if (!target) {
    throw new Error(
      `task ${taskId} not found — known ids: ${tasks.map((t) => t.id).join(", ") || "(none)"}`,
    );
  }
  const targetStatus = String(target.frontmatter.status ?? "");
  if (targetStatus === "done" || targetStatus === "archived") {
    throw new Error(
      `task ${taskId} is ${targetStatus} — re-open it before switching (edit status: pending in the file, or accept an update proposal)`,
    );
  }

  const changed: TaskMutationResult["changed"] = [];

  // Demote any sibling currently in_progress so there's a single active task.
  const today = todayUtc();
  const competitors = tasks.filter(
    (t) => t.id !== taskId && String(t.frontmatter.status ?? "") === "in_progress",
  );
  for (const c of competitors) {
    const r = await writeFrontmatter(c, { status: "pending", updated: today });
    changed.push({ id: c.id, from: r.from, to: r.to });
  }

  // Promote the target. If it was already in_progress, we still bump `updated` so
  // it wins the active-context tiebreak (most-recently-updated in_progress task).
  const r = await writeFrontmatter(target, { status: "in_progress", updated: today });
  changed.push({ id: target.id, from: r.from, to: r.to });

  const summary =
    competitors.length > 0
      ? `task switch → ${target.id} (demoted ${competitors.map((c) => c.id).join(", ")})`
      : `task switch → ${target.id}`;
  await writeIndexCurrentTask(repoRoot, target.id);
  const nextAction =
    typeof target.frontmatter.next_action === "string" ? target.frontmatter.next_action : null;
  await writeIndexNextAction(repoRoot, nextAction);
  await appendChangelog(repoRoot, summary);

  return { changed, summary };
}

/**
 * Mark `taskId` (or the active context's current task when no id is given) as done.
 * Also writes a `completed: <YYYY-MM-DD>` field to the task frontmatter so a later
 * timeline / report query can distinguish "done long ago" from "just done."
 */
export async function completeTask(
  repoRoot: string,
  cfg: Config,
  taskId?: string,
): Promise<TaskMutationResult> {
  let id = taskId;
  if (!id) {
    const ctx = await buildActiveContext(repoRoot, cfg);
    if (!ctx.currentTask) {
      throw new Error(
        "no current task to complete — pass a task id explicitly, or run `cairndex task switch <id>` first",
      );
    }
    id = ctx.currentTask.id;
  }

  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const target = tasks.find((t) => t.id === id);
  if (!target) {
    throw new Error(
      `task ${id} not found — known ids: ${tasks.map((t) => t.id).join(", ") || "(none)"}`,
    );
  }
  const status = String(target.frontmatter.status ?? "");
  if (status === "done" || status === "archived") {
    throw new Error(`task ${id} is already ${status}`);
  }

  const today = todayUtc();
  const r = await writeFrontmatter(target, {
    status: "done",
    updated: today,
    completed: today,
  });
  const changed = [{ id: target.id, from: r.from, to: r.to }];
  const summary = `task complete → ${target.id}`;
  await writeIndexCurrentTask(repoRoot, null, target.id);
  await writeIndexNextAction(repoRoot, null);
  await appendChangelog(repoRoot, summary);
  return { changed, summary };
}

export interface PhaseChange {
  from: string | null;
  to: string;
  since: string;
}

/**
 * Set the project phase by mutating `<vault>/index.md` frontmatter. Also bumps
 * `phase_since` to today so the dashboard's "since X" badge is meaningful.
 *
 * Creates `index.md` with a minimal body if it does not exist (a freshly initialized
 * vault that has not yet been touched). This is the happy-path of every other vault
 * write — the file is treated as a durable artifact that should always be present.
 */
export async function setPhase(repoRoot: string, phase: string): Promise<PhaseChange> {
  if (!phase.trim()) throw new Error("phase name must be non-empty");
  const path = indexPath(repoRoot);
  let raw: string;
  if (existsSync(path)) {
    raw = await readFile(path, "utf8");
  } else {
    raw = "---\n---\n# Index\n";
  }
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const from = data.phase ? String(data.phase) : null;
  const since = todayUtc();
  const merged: Record<string, unknown> = { ...data, phase: phase.trim(), phase_since: since };
  const next = serializeFrontmatter(merged, content);
  await writeFile(path, next, "utf8");
  await appendChangelog(repoRoot, `phase → ${phase.trim()}${from ? ` (was ${from})` : ""}`);
  return { from, to: phase.trim(), since };
}
