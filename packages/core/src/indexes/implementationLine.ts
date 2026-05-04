import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Config } from "../config.js";
import { indexesPath } from "../paths.js";
import { type NodeFile, listNodeFiles } from "../vault.js";

/**
 * Implementation line: a chronological view of project work — completed first
 * (newest), then in-progress, then pending. Groups tasks by their owning plan
 * so the user can answer "which tasks shipped which plan-phase, when?"
 *
 * This index is the seed for the `/projects/:alias/implementation` page (Phase 3
 * of the vibe-coding roadmap). Storing it on disk under `indexes/` follows the
 * same pattern as `active-context.json`, `node-summary.json`, etc. — fast reads
 * for the dashboard / page without re-walking the vault on every request.
 *
 * Compared to `nodeSummary.json`, this index is task-only and adds plan-task
 * linkage that node-summary doesn't carry. Phase-level linkage (Phase A → tasks)
 * is intentionally NOT computed here — phases live in plan markdown bodies, not
 * frontmatter, so the only reliable way to extract them is regex which is too
 * fragile for an authoritative index. That's tracked as Phase 4 design work.
 */

export const IMPL_LINE_FILE = "implementation-line.json";

export interface ImplementationLineEntry {
  taskId: string;
  title: string;
  status: string;
  created: string;
  updated: string;
  /** YYYY-MM-DD when the task was marked done, else null. */
  completed: string | null;
  /** Session that the task was first scoped in, from provenance.session. */
  sessionId: string | null;
  /** First `PLAN-*` reference found in `links` frontmatter, else null. */
  planId: string | null;
}

export interface ImplementationLine {
  generatedAt: string;
  entries: ImplementationLineEntry[];
  /**
   * Plan-id → ordered list of task ids belonging to that plan, in entries order.
   * Tasks with no PLAN-* link land under the literal key "(unlinked)" so the page
   * can render a separate bucket without losing them.
   */
  byPlan: Record<string, string[]>;
}

export function implementationLinePath(repoRoot: string): string {
  return join(indexesPath(repoRoot), IMPL_LINE_FILE);
}

const STATUS_ORDER: Record<string, number> = {
  // Done items come first so the user sees recent shipping at the top of the
  // page. Within "done" we sort by `completed` desc, so the most-recent ship is
  // first. After done: in_progress, then pending, then archived/other.
  done: 0,
  in_progress: 1,
  pending: 2,
  blocked: 3,
  archived: 4,
};

function statusRank(status: string): number {
  return STATUS_ORDER[status] ?? 5;
}

function extractPlanId(links: unknown): string | null {
  // links may be either array of strings (legacy `links: [ADR-001]`) or array of
  // objects (`links: [{type: 'implements', target: 'PLAN-001'}]`). Check both.
  if (!Array.isArray(links)) return null;
  for (const item of links) {
    if (typeof item === "string" && /^PLAN-/.test(item)) return item;
    if (item && typeof item === "object" && "target" in item) {
      const target = (item as { target: unknown }).target;
      if (typeof target === "string" && /^PLAN-/.test(target)) return target;
    }
  }
  return null;
}

function asEntry(node: NodeFile): ImplementationLineEntry {
  const fm = node.frontmatter as Record<string, unknown>;
  const provenance = (fm.provenance ?? {}) as Record<string, unknown>;
  const completedRaw = fm.completed;
  const sessionRaw = provenance.session;
  return {
    taskId: node.id,
    title: typeof fm.title === "string" ? fm.title : node.id,
    status: typeof fm.status === "string" ? fm.status : "",
    created: typeof fm.created === "string" ? fm.created : "",
    updated: typeof fm.updated === "string" ? fm.updated : "",
    completed: typeof completedRaw === "string" ? completedRaw : null,
    sessionId: typeof sessionRaw === "string" ? sessionRaw : null,
    planId: extractPlanId(fm.links),
  };
}

function compareEntries(a: ImplementationLineEntry, b: ImplementationLineEntry): number {
  // 1. Status order (done first, then in_progress, then pending, then other).
  const ra = statusRank(a.status);
  const rb = statusRank(b.status);
  if (ra !== rb) return ra - rb;
  // 2. Within done: completed desc (newest ship first). Falsy completed pushes
  //    to the bottom of its bucket so the typed dates dominate.
  if (a.status === "done" && b.status === "done") {
    if (a.completed && b.completed) {
      if (a.completed === b.completed) return a.taskId.localeCompare(b.taskId);
      return a.completed < b.completed ? 1 : -1;
    }
    if (a.completed) return -1;
    if (b.completed) return 1;
  }
  // 3. Otherwise: updated desc (most recently touched first).
  if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
  return a.taskId.localeCompare(b.taskId);
}

export async function buildImplementationLine(
  repoRoot: string,
  cfg: Config,
): Promise<ImplementationLine> {
  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const entries = tasks.map(asEntry).sort(compareEntries);

  const byPlan: Record<string, string[]> = {};
  for (const e of entries) {
    const key = e.planId ?? "(unlinked)";
    if (!byPlan[key]) byPlan[key] = [];
    byPlan[key].push(e.taskId);
  }

  return {
    generatedAt: new Date().toISOString(),
    entries,
    byPlan,
  };
}

export interface RegenerateImplementationLineResult {
  path: string;
  line: ImplementationLine;
  changed: boolean;
}

interface CompareableLine {
  entries: ImplementationLine["entries"];
  byPlan: ImplementationLine["byPlan"];
}

function withoutGeneratedAt(line: ImplementationLine): CompareableLine {
  return { entries: line.entries, byPlan: line.byPlan };
}

export async function regenerateImplementationLine(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateImplementationLineResult> {
  const line = await buildImplementationLine(repoRoot, cfg);
  const path = implementationLinePath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  let changed = true;
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8")) as ImplementationLine;
      changed =
        JSON.stringify(withoutGeneratedAt(prev)) !== JSON.stringify(withoutGeneratedAt(line));
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeFile(path, `${JSON.stringify(line, null, 2)}\n`, "utf8");
  }
  return { path, line, changed };
}
