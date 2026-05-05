import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../frontmatter.js";
import { intentFilePath } from "../intent.js";
import { inboxProposalsPath, nodeFolderPath } from "../paths.js";
import type { ActiveTaskInfo, LastSessionInfo, PendingMemoryInfo, WhyContextInfo } from "./types.js";

export interface ReaderOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Mutated by each reader to record the absolute paths of files it read. */
  sources?: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Push a path into the sources array when the array is present. */
function trackSource(sources: string[] | undefined, path: string): void {
  sources?.push(path);
}

/** Resolve the vault root from ReaderOptions. */
function resolveRoot(opts: ReaderOptions): string {
  return opts.cwd;
}

/** True if a filename looks like a session file (yyyy-MM-dd-HHmm*.md). */
function isSessionFilename(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}-\d{4}/.test(name) && name.endsWith(".md");
}

/** Sort session filenames descending (newest first) by their leading id segment. */
function compareSessionFilesDesc(a: string, b: string): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

// ---------------------------------------------------------------------------
// readLastSession
// ---------------------------------------------------------------------------

/**
 * Find the most recent session file in the sessions/ folder, parse its
 * frontmatter, and return a LastSessionInfo.
 *
 * Returns null when no session files exist or the folder is absent.
 */
export async function readLastSession(opts: ReaderOptions): Promise<LastSessionInfo | null> {
  const root = resolveRoot(opts);
  const sessionsDir = nodeFolderPath(root, "sessions");
  if (!existsSync(sessionsDir)) return null;

  let entries: string[];
  try {
    entries = await readdir(sessionsDir);
  } catch {
    return null;
  }

  const sessionFiles = entries.filter(isSessionFilename).sort(compareSessionFilesDesc);
  if (sessionFiles.length === 0) return null;

  const filename = sessionFiles[0]!;
  const filePath = join(sessionsDir, filename);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  trackSource(opts.sources, filePath);

  let data: Record<string, unknown>;
  try {
    ({ data } = parseFrontmatter<Record<string, unknown>>(raw));
  } catch {
    return null;
  }

  const id = typeof data.id === "string" ? data.id : filename.replace(/\.md$/, "");
  const date = typeof data.date === "string" ? data.date : id.slice(0, 10);
  const summary = typeof data.summary === "string" ? data.summary : "";
  const nsRaw = data.narrative_status;
  const narrativeStatus: LastSessionInfo["narrativeStatus"] =
    nsRaw === "auto" || nsRaw === "confirmed" ? nsRaw : "empty";

  return { id, date, narrativeStatus, summary };
}

// ---------------------------------------------------------------------------
// readActiveTask
// ---------------------------------------------------------------------------

export interface ReadActiveTaskOptions extends ReaderOptions {
  /** Override today for testability of ageDays. Defaults to new Date(). */
  today?: Date;
}

/**
 * Scan the tasks/ folder for the current active task (in_progress preferred,
 * falling back to pending), then return ActiveTaskInfo.
 *
 * Reuses the same priority logic as buildActiveContext (in_progress > pending,
 * tiebreak by updated desc) but reads directly so this reader is self-contained
 * and does not require a Config object or active-context.json cache — keeping
 * resume reads independent of the index-update lifecycle.
 *
 * Returns null when no in_progress or pending task is found.
 */
export async function readActiveTask(opts: ReadActiveTaskOptions): Promise<ActiveTaskInfo | null> {
  const root = resolveRoot(opts);
  const tasksDir = nodeFolderPath(root, "tasks");
  if (!existsSync(tasksDir)) return null;

  let entries: string[];
  try {
    entries = await readdir(tasksDir);
  } catch {
    return null;
  }

  const taskFiles = entries.filter((e) => e.endsWith(".md") && e.toLowerCase() !== "readme.md");

  interface TaskCandidate {
    id: string;
    title: string;
    status: string;
    nextAction: string | null;
    updated: string;
    path: string;
  }

  const candidates: TaskCandidate[] = [];

  for (const filename of taskFiles) {
    const filePath = join(tasksDir, filename);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = parseFrontmatter<Record<string, unknown>>(raw));
    } catch {
      continue;
    }

    const status = typeof data.status === "string" ? data.status : "";
    if (status !== "in_progress" && status !== "pending") continue;

    // Derive id from frontmatter or filename
    const stem = filename.replace(/\.md$/, "");
    const idPart = stem.split("-").slice(0, 2).join("-");
    const id = typeof data.id === "string" ? data.id : idPart;
    const title = typeof data.title === "string" ? data.title : id;
    const nextAction = typeof data.next_action === "string" ? data.next_action : null;
    const updated = typeof data.updated === "string" ? data.updated : "";

    candidates.push({ id, title, status, nextAction, updated, path: filePath });
  }

  if (candidates.length === 0) return null;

  // Priority: in_progress > pending; within same status, newest updated wins
  const inProgress = candidates.filter((c) => c.status === "in_progress");
  const pending = candidates.filter((c) => c.status === "pending");

  const sortByUpdatedDesc = (a: TaskCandidate, b: TaskCandidate): number => {
    if (a.updated === b.updated) return 0;
    return a.updated > b.updated ? -1 : 1;
  };

  inProgress.sort(sortByUpdatedDesc);
  pending.sort(sortByUpdatedDesc);

  const winner = inProgress[0] ?? pending[0];
  if (!winner) return null;

  trackSource(opts.sources, winner.path);

  const today = opts.today ?? new Date();
  let ageDays = 0;
  if (winner.updated) {
    const updatedMs = Date.parse(winner.updated);
    if (!isNaN(updatedMs)) {
      const todayMs = Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      ageDays = Math.max(0, Math.floor((todayMs - updatedMs) / 86_400_000));
    }
  }

  return {
    id: winner.id,
    title: winner.title,
    status: winner.status,
    nextAction: winner.nextAction,
    ageDays,
  };
}

// ---------------------------------------------------------------------------
// readWhyContext
// ---------------------------------------------------------------------------

export interface ReadWhyContextOptions extends ReaderOptions {
  /** The active task id to look up. */
  taskId: string;
}

/**
 * Search decisions/ and insights/ for a node whose links array contains an
 * entry targeting the given taskId. Returns the first match found (decisions
 * checked before insights).
 *
 * Returns null when no matching ADR or insight is found.
 */
export async function readWhyContext(opts: ReadWhyContextOptions): Promise<WhyContextInfo | null> {
  const root = resolveRoot(opts);

  async function scanFolder(
    folderName: string,
    kind: WhyContextInfo["kind"],
  ): Promise<WhyContextInfo | null> {
    const dir = nodeFolderPath(root, folderName);
    if (!existsSync(dir)) return null;

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return null;
    }

    const mdFiles = entries.filter((e) => e.endsWith(".md") && e.toLowerCase() !== "readme.md");

    for (const filename of mdFiles) {
      const filePath = join(dir, filename);
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let data: Record<string, unknown>;
      try {
        ({ data } = parseFrontmatter<Record<string, unknown>>(raw));
      } catch {
        continue;
      }

      // Check links for a match to taskId
      const links = data.links;
      if (!Array.isArray(links)) continue;

      const hasLink = links.some((l) => {
        if (typeof l === "object" && l !== null) {
          // Typed edge: { type: "...", target: "TASK-003" }
          const obj = l as Record<string, unknown>;
          return typeof obj.target === "string" && obj.target === opts.taskId;
        }
        // Bare string reference: "TASK-003"
        return typeof l === "string" && l === opts.taskId;
      });

      if (!hasLink) continue;

      trackSource(opts.sources, filePath);

      const stem = filename.replace(/\.md$/, "");
      const idPart = stem.split("-").slice(0, 2).join("-");
      const id = typeof data.id === "string" ? data.id : idPart;
      const title = typeof data.title === "string" ? data.title : id;

      return { kind, id, title };
    }

    return null;
  }

  const decisionResult = await scanFolder("decisions", "decision");
  if (decisionResult) return decisionResult;

  const insightResult = await scanFolder("insights", "insight");
  return insightResult;
}

// ---------------------------------------------------------------------------
// readSuggestedNext
// ---------------------------------------------------------------------------

/**
 * Determine what to do next for the current session. Priority:
 *   1. Intent file steps (state/current-intent.md) — first step if present
 *   2. Active task next_action field
 *   3. null
 *
 * Does not call readActiveTask again; accepts the already-resolved ActiveTaskInfo
 * to avoid double-reading task files.
 */
export async function readSuggestedNext(
  opts: ReaderOptions,
  activeTask?: ActiveTaskInfo | null,
): Promise<string | null> {
  const root = resolveRoot(opts);

  // 1. Try intent file
  const intentPath = intentFilePath(root);
  if (existsSync(intentPath)) {
    let raw: string;
    try {
      raw = await readFile(intentPath, "utf8");
      trackSource(opts.sources, intentPath);
      const { content } = parseFrontmatter<Record<string, unknown>>(raw);
      // parseSteps: look for "- <step>" lines
      const steps = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- "))
        .map((l) => l.slice(2).trim())
        .filter((l) => l.length > 0);
      if (steps.length > 0 && steps[0]) {
        return steps[0];
      }
    } catch {
      // fall through
    }
  }

  // 2. Fall back to active task next_action
  if (activeTask?.nextAction) {
    return activeTask.nextAction;
  }

  return null;
}

// ---------------------------------------------------------------------------
// readPendingMemory
// ---------------------------------------------------------------------------

const PENDING_MEMORY_MAX_TITLES = 5;

/**
 * Scan inbox/proposed-memory-updates/ for PROP files with status === "pending".
 * Returns the count and titles (summary field) of up to 5 most recent proposals.
 *
 * Does NOT read from signals/ — spec invariant: signals are audit data, not
 * authoritative resume content.
 */
export async function readPendingMemory(opts: ReaderOptions): Promise<PendingMemoryInfo> {
  const root = resolveRoot(opts);
  const proposalsDir = inboxProposalsPath(root);

  if (!existsSync(proposalsDir)) {
    return { count: 0, titles: [] };
  }

  let entries: string[];
  try {
    entries = await readdir(proposalsDir);
  } catch {
    return { count: 0, titles: [] };
  }

  const mdFiles = entries
    .filter((e) => e.endsWith(".md") && e.toLowerCase() !== "readme.md")
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)); // newest proposal id first

  const titles: string[] = [];
  let count = 0;

  for (const filename of mdFiles) {
    const filePath = join(proposalsDir, filename);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    let data: Record<string, unknown>;
    try {
      ({ data } = parseFrontmatter<Record<string, unknown>>(raw));
    } catch {
      continue;
    }

    if (data.status !== "pending") continue;

    trackSource(opts.sources, filePath);
    count += 1;

    const title = typeof data.summary === "string" ? data.summary : filename.replace(/\.md$/, "");
    if (titles.length < PENDING_MEMORY_MAX_TITLES) {
      titles.push(title);
    }
  }

  return { count, titles };
}
