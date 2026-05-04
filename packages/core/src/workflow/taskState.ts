import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { appendChangelog } from "../changelog.js";
import type { Config } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { buildActiveContext } from "../indexes/activeContext.js";
import { indexPath } from "../paths.js";
import { type NodeFile, listNodeFiles } from "../vault.js";

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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
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
