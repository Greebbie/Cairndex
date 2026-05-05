import { promises as fs } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { vaultPath, inboxProposalsPath, resumeJsonPath } from "../paths.js";
import { parseFrontmatter } from "../frontmatter.js";
import { readActiveTask } from "../resume/readers.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoverageLevel = "green" | "yellow" | "red";

export interface CoverageIndicator {
  name: string;
  level: CoverageLevel;
  label: string;
  detail: string;
}

export interface ScoreOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Override today for testability. Defaults to new Date(). */
  today?: Date;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DAYS_MS = (n: number): number => n * 24 * 60 * 60 * 1000;

/**
 * Parse the date portion of a session ID like "2026-05-05-1200".
 * Returns a Date in UTC, or null if the format is unrecognised.
 */
function parseSessionDate(id: string): Date | null {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00"] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm)));
}

// ---------------------------------------------------------------------------
// Indicator 1: Recent narrative coverage
// ---------------------------------------------------------------------------

/**
 * Score whether the latest recent session has enough narrative to hand off.
 *
 * Historical unconfirmed sessions are hygiene debt, but they should not keep the
 * current project blocked forever after a busy dogfood week. Handoff readiness
 * needs to answer a narrower question: can the next human or agent understand the
 * last turn? Therefore:
 *   green  latest recent session is confirmed
 *   yellow latest recent session has an auto narrative
 *   red    latest recent session is empty / unclosed
 *
 * Detail still includes the last-7-day confirmed ratio so the backlog remains
 * visible without becoming the hard gate.
 */
export async function scoreRecentNarrative(opts: ScoreOptions): Promise<CoverageIndicator> {
  const today = opts.today ?? new Date();
  const cutoff = today.getTime() - DAYS_MS(7);
  const sessionsDir = join(vaultPath(opts.cwd), "sessions");

  if (!existsSync(sessionsDir)) {
    return {
      name: "recent-narrative",
      level: "green",
      label: "Recent narrative",
      detail: "no sessions",
    };
  }

  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return {
      name: "recent-narrative",
      level: "green",
      label: "Recent narrative",
      detail: "no sessions",
    };
  }

  const recent: Array<{ id: string; status: string }> = [];

  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const id = name.replace(/\.md$/, "");
    const idDate = parseSessionDate(id);
    if (!idDate || idDate.getTime() < cutoff) continue;

    try {
      const raw = await fs.readFile(join(sessionsDir, name), "utf8");
      const { data } = parseFrontmatter<{ narrative_status?: string }>(raw);
      recent.push({ id, status: data.narrative_status ?? "empty" });
    } catch {
      // skip malformed files
    }
  }

  if (recent.length === 0) {
    return {
      name: "recent-narrative",
      level: "green",
      label: "Recent narrative",
      detail: "no sessions in last 7 days",
    };
  }

  recent.sort((a, b) => b.id.localeCompare(a.id));
  const latest = recent[0];
  const confirmed = recent.filter((s) => s.status === "confirmed").length;
  const ratio = `${confirmed}/${recent.length} confirmed in last 7 days`;
  const latestId = latest?.id ?? "(unknown)";
  const latestStatus = latest?.status ?? "empty";
  const level: CoverageLevel =
    latestStatus === "confirmed" ? "green" : latestStatus === "auto" ? "yellow" : "red";
  const latestDetail =
    latestStatus === "confirmed"
      ? `${latestId} confirmed`
      : latestStatus === "auto"
        ? `${latestId} has auto narrative`
        : `${latestId} needs close-out`;

  return {
    name: "recent-narrative",
    level,
    label: "Recent narrative",
    detail: `${latestDetail} (${ratio})`,
  };
}

// ---------------------------------------------------------------------------
// Indicator 2: Active task progress (staleness)
// ---------------------------------------------------------------------------

/**
 * Score how recently the active task was last updated.
 *
 * Thresholds:
 *   green  ≤ 3 days stale
 *   yellow 4–7 days stale
 *   red    > 7 days stale
 *
 * Returns green when there is no active task (nothing to go stale).
 */
export async function scoreActiveTaskProgress(opts: ScoreOptions): Promise<CoverageIndicator> {
  const today = opts.today ?? new Date();
  const task = await readActiveTask({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    today,
  });

  if (!task) {
    return {
      name: "active-task-progress",
      level: "green",
      label: "Active task progress",
      detail: "no active task",
    };
  }

  const level: CoverageLevel = task.ageDays <= 3 ? "green" : task.ageDays <= 7 ? "yellow" : "red";

  return {
    name: "active-task-progress",
    level,
    label: "Active task progress",
    detail: `${task.id} updated ${task.ageDays}d ago`,
  };
}

// ---------------------------------------------------------------------------
// Indicator 3: Next action defined
// ---------------------------------------------------------------------------

/**
 * Score whether the active task has a non-empty next_action field.
 *
 * green  — active task has a next_action
 * yellow — active task exists but next_action is absent or empty
 * red    — no active task at all (no starting point for next session)
 */
export async function scoreNextActionDefined(opts: ScoreOptions): Promise<CoverageIndicator> {
  const task = await readActiveTask({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
  });

  if (!task) {
    return {
      name: "next-action-defined",
      level: "red",
      label: "Next action defined",
      detail: "no active task",
    };
  }

  if (!task.nextAction || task.nextAction.trim() === "") {
    return {
      name: "next-action-defined",
      level: "yellow",
      label: "Next action defined",
      detail: `${task.id} has no next_action`,
    };
  }

  return {
    name: "next-action-defined",
    level: "green",
    label: "Next action defined",
    detail: task.nextAction.slice(0, 60),
  };
}

// ---------------------------------------------------------------------------
// Indicator 4: Inbox hygiene
// ---------------------------------------------------------------------------

/**
 * Score how many PROP files under inbox/proposed-memory-updates/ have status === "pending".
 *
 * IMPORTANT: signals/ files are intentionally excluded — signals are audit data,
 * not authoritative memory proposals. Only PROP files in the inbox proposals dir count.
 *
 * Thresholds:
 *   green  < 5 pending
 *   yellow 5–10 pending
 *   red    > 10 pending
 */
export async function scoreInboxHygiene(opts: ScoreOptions): Promise<CoverageIndicator> {
  const dir = inboxProposalsPath(opts.cwd);

  if (!existsSync(dir)) {
    return {
      name: "inbox-hygiene",
      level: "green",
      label: "Inbox hygiene",
      detail: "0 pending",
    };
  }

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return {
      name: "inbox-hygiene",
      level: "green",
      label: "Inbox hygiene",
      detail: "0 pending",
    };
  }

  let count = 0;
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    try {
      const raw = await fs.readFile(join(dir, name), "utf8");
      const { data } = parseFrontmatter<{ status?: string }>(raw);
      if (data.status === "pending") count++;
    } catch {
      // skip malformed files
    }
  }

  const level: CoverageLevel = count < 5 ? "green" : count <= 10 ? "yellow" : "red";

  return {
    name: "inbox-hygiene",
    level,
    label: "Inbox hygiene",
    detail: `${count} pending`,
  };
}

// ---------------------------------------------------------------------------
// Indicator 5: Resume consumption
// ---------------------------------------------------------------------------

/**
 * Score how recently the resume cache (state/resume.json) was written.
 *
 * P0 limitation: mtime tracks the last WRITE, not the last READ. This is used
 * as a proxy for "resume was recently generated and therefore recently consumed".
 * A more accurate approach (separate access log or explicit "read" timestamp)
 * would require a dedicated tracking mechanism beyond P0 scope.
 *
 * Thresholds:
 *   green  cache written within the last 3 days
 *   yellow cache is missing OR older than 3 days
 *   red    (not used — missing/old are both yellow because absence is recoverable)
 */
export async function scoreResumeConsumption(opts: ScoreOptions): Promise<CoverageIndicator> {
  const today = opts.today ?? new Date();
  const path = resumeJsonPath(opts.cwd);

  if (!existsSync(path)) {
    return {
      name: "resume-consumption",
      level: "yellow",
      label: "Resume consumption",
      detail: "no resume cache",
    };
  }

  const mtime = statSync(path).mtimeMs;
  const ageMs = today.getTime() - mtime;
  const ageDays = Math.round(ageMs / DAYS_MS(1));
  const level: CoverageLevel = ageMs <= DAYS_MS(3) ? "green" : "yellow";

  return {
    name: "resume-consumption",
    level,
    label: "Resume consumption",
    detail: `cache age ${ageDays}d`,
  };
}

// ---------------------------------------------------------------------------
// Convenience: run all 5 scorers
// ---------------------------------------------------------------------------

/**
 * Run all 5 story coverage scorers and return them in stable display order:
 *   1. recent-narrative
 *   2. active-task-progress
 *   3. next-action-defined
 *   4. inbox-hygiene
 *   5. resume-consumption
 */
export async function scoreAllStoryCoverage(opts: ScoreOptions): Promise<CoverageIndicator[]> {
  return [
    await scoreRecentNarrative(opts),
    await scoreActiveTaskProgress(opts),
    await scoreNextActionDefined(opts),
    await scoreInboxHygiene(opts),
    await scoreResumeConsumption(opts),
  ];
}
