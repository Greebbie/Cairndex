import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Config } from "../config.js";
import { parseFrontmatter } from "../frontmatter.js";
import { activeContextPath, indexPath } from "../paths.js";
import { type NodeFile, listNodeFiles } from "../vault.js";

export interface NodeRef {
  id: string;
  title: string;
  status: string;
}

export interface ActivePlanRef extends NodeRef {
  currentTaskId: string | null;
}

export interface ActiveContext {
  phase: string;
  phaseSince: string | null;
  activeGoal: NodeRef | null;
  activeSpec: NodeRef | null;
  activePlan: ActivePlanRef | null;
  currentTask: NodeRef | null;
  nextAction: string | null;
  warnings: string[];
  generatedAt: string;
}

const DEFAULT_PHASE = "discovering";

interface IndexFrontmatter {
  phase?: string;
  phase_since?: string;
  next_action?: string;
}

async function readIndexFrontmatter(repoRoot: string): Promise<IndexFrontmatter> {
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const { data } = parseFrontmatter<IndexFrontmatter>(raw);
    return data ?? {};
  } catch {
    return {};
  }
}

function nodeRef(node: NodeFile): NodeRef {
  return {
    id: node.id,
    title: String(node.frontmatter.title ?? node.id),
    status: String(node.frontmatter.status ?? ""),
  };
}

function lastUpdatedStr(node: NodeFile): string {
  const updated = node.frontmatter.updated ?? node.frontmatter.created ?? "";
  return String(updated);
}

function compareUpdatedDesc(a: NodeFile, b: NodeFile): number {
  const av = lastUpdatedStr(a);
  const bv = lastUpdatedStr(b);
  if (av === bv) return 0;
  return av < bv ? 1 : -1;
}

function pickActive(nodes: NodeFile[], activeStatuses: ReadonlySet<string>): NodeFile[] {
  return nodes
    .filter((n) => activeStatuses.has(String(n.frontmatter.status ?? "")))
    .sort(compareUpdatedDesc);
}

export async function buildActiveContext(repoRoot: string, cfg: Config): Promise<ActiveContext> {
  const idx = await readIndexFrontmatter(repoRoot);
  const warnings: string[] = [];

  const goals = await listNodeFiles(repoRoot, cfg, "goal");
  const specs = await listNodeFiles(repoRoot, cfg, "spec");
  const plans = await listNodeFiles(repoRoot, cfg, "plan");
  const tasks = await listNodeFiles(repoRoot, cfg, "task");

  const activeGoals = pickActive(goals, new Set(["active"]));
  const activeSpecs = pickActive(specs, new Set(["active"]));
  const activePlans = pickActive(plans, new Set(["active"]));

  if (activeGoals.length > 1) {
    warnings.push(
      `multiple active goals detected (${activeGoals.length}): ${activeGoals.map((g) => g.id).join(", ")}`,
    );
  }
  if (activeSpecs.length > 1) {
    warnings.push(
      `multiple active specs detected (${activeSpecs.length}): ${activeSpecs.map((s) => s.id).join(", ")}`,
    );
  }
  if (activePlans.length > 1) {
    warnings.push(
      `multiple active plans detected (${activePlans.length}): ${activePlans.map((p) => p.id).join(", ")}`,
    );
  }

  const inProgress = pickActive(tasks, new Set(["in_progress"]));
  const pending = pickActive(tasks, new Set(["pending"]));
  const currentTaskNode = inProgress[0] ?? pending[0] ?? null;

  const activePlan = activePlans[0]
    ? {
        ...nodeRef(activePlans[0]),
        currentTaskId: currentTaskNode?.id ?? null,
      }
    : null;

  return {
    phase: idx.phase ?? DEFAULT_PHASE,
    phaseSince: idx.phase_since ?? null,
    activeGoal: activeGoals[0] ? nodeRef(activeGoals[0]) : null,
    activeSpec: activeSpecs[0] ? nodeRef(activeSpecs[0]) : null,
    activePlan,
    currentTask: currentTaskNode ? nodeRef(currentTaskNode) : null,
    nextAction: idx.next_action ?? null,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

interface CompareableContext {
  phase: ActiveContext["phase"];
  phaseSince: ActiveContext["phaseSince"];
  activeGoal: ActiveContext["activeGoal"];
  activeSpec: ActiveContext["activeSpec"];
  activePlan: ActiveContext["activePlan"];
  currentTask: ActiveContext["currentTask"];
  nextAction: ActiveContext["nextAction"];
  warnings: ActiveContext["warnings"];
}

function withoutGeneratedAt(ctx: ActiveContext): CompareableContext {
  const { generatedAt: _drop, ...rest } = ctx;
  return rest;
}

export interface RegenerateResult {
  path: string;
  ctx: ActiveContext;
  changed: boolean;
}

export async function regenerateActiveContext(
  repoRoot: string,
  cfg: Config,
): Promise<RegenerateResult> {
  const ctx = await buildActiveContext(repoRoot, cfg);
  const path = activeContextPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });

  let changed = true;
  if (existsSync(path)) {
    try {
      const prev = JSON.parse(await readFile(path, "utf8")) as ActiveContext;
      const same =
        JSON.stringify(withoutGeneratedAt(prev)) === JSON.stringify(withoutGeneratedAt(ctx));
      changed = !same;
    } catch {
      changed = true;
    }
  }

  if (changed) {
    await writeFile(path, `${JSON.stringify(ctx, null, 2)}\n`, "utf8");
  }
  return { path, ctx, changed };
}
