import { createHash } from "node:crypto";
import { computeBacklinks } from "../backlinks.js";
import type { Config } from "../config.js";
import { buildActiveContext } from "../indexes/activeContext.js";
import type { NodeType } from "../types.js";
import { listNodeFiles, type NodeFile } from "../vault.js";
import { estimateTokens, trimToBudget } from "./budget.js";
import {
  type BuildContextPackInput,
  type ContextPackItem,
  type ContextPackOutput,
  PRIORITY,
} from "./types.js";

const DEFAULT_RECENT_SESSIONS = 4;
const DEFAULT_TOKEN_BUDGET = 8000;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "untitled"
  );
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function makePackId(task: string, builtAt: string): string {
  const slug = slugify(task);
  const h = shortHash(`${task}|${builtAt}`);
  return `pack-${slug}-${h}`;
}

function nodeItem(
  node: NodeFile,
  reason: string,
  reasonPriority: number,
  type: NodeType | "project-state",
): ContextPackItem {
  const item: ContextPackItem = {
    type,
    id: node.id,
    title: String(node.frontmatter.title ?? node.id),
    reason,
    reasonPriority,
    body: node.body,
  };
  const status = node.frontmatter.status;
  if (typeof status === "string" && status.length > 0) {
    item.status = status;
  }
  return item;
}

function compareSessionDateDesc(a: NodeFile, b: NodeFile): number {
  const ad = String(a.frontmatter.date ?? a.id);
  const bd = String(b.frontmatter.date ?? b.id);
  if (ad === bd) return a.id < b.id ? 1 : -1;
  return ad < bd ? 1 : -1;
}

function projectStateBody(
  ctx: Awaited<ReturnType<typeof buildActiveContext>>,
): { title: string; body: string } {
  const lines: string[] = [];
  lines.push(`Phase: ${ctx.phase}`);
  if (ctx.phaseSince) lines.push(`Phase since: ${ctx.phaseSince}`);
  if (ctx.activeGoal) lines.push(`Active goal: ${ctx.activeGoal.id} — ${ctx.activeGoal.title}`);
  if (ctx.activeSpec)
    lines.push(`Active spec: ${ctx.activeSpec.id} (${ctx.activeSpec.status}) — ${ctx.activeSpec.title}`);
  if (ctx.activePlan) {
    const cur = ctx.activePlan.currentTaskId ? ` → current ${ctx.activePlan.currentTaskId}` : "";
    lines.push(`Active plan: ${ctx.activePlan.id} — ${ctx.activePlan.title}${cur}`);
  }
  if (ctx.currentTask)
    lines.push(`Current task: ${ctx.currentTask.id} — ${ctx.currentTask.title} (${ctx.currentTask.status})`);
  if (ctx.nextAction) lines.push(`Next action: ${ctx.nextAction}`);
  return { title: "Project State", body: lines.join("\n") };
}

export async function buildContextPack(
  repoRoot: string,
  cfg: Config,
  input: BuildContextPackInput = {},
): Promise<ContextPackOutput> {
  const task = input.task ?? "(no task)";
  const recentLimit = input.recentSessionsLimit ?? DEFAULT_RECENT_SESSIONS;
  const tokenBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  const ctx = await buildActiveContext(repoRoot, cfg);
  const items: ContextPackItem[] = [];

  // 1. Project state header (synthetic).
  const psHeader = projectStateBody(ctx);
  items.push({
    type: "project-state",
    id: "PROJECT-STATE",
    title: psHeader.title,
    reason: "project state",
    reasonPriority: PRIORITY.PROJECT_STATE,
    body: psHeader.body,
  });

  // 2. Active spec, plan, task, goal node bodies (full).
  const specsAll = await listNodeFiles(repoRoot, cfg, "spec");
  const plansAll = await listNodeFiles(repoRoot, cfg, "plan");
  const tasksAll = await listNodeFiles(repoRoot, cfg, "task");
  const goalsAll = await listNodeFiles(repoRoot, cfg, "goal");

  const findById = (list: NodeFile[], id: string | undefined) =>
    id ? list.find((n) => n.id === id) : undefined;

  const activeGoalNode = ctx.activeGoal ? findById(goalsAll, ctx.activeGoal.id) : undefined;
  if (activeGoalNode)
    items.push(nodeItem(activeGoalNode, "active goal", PRIORITY.ACTIVE_GOAL, "goal"));

  const activeSpecNode = ctx.activeSpec ? findById(specsAll, ctx.activeSpec.id) : undefined;
  if (activeSpecNode)
    items.push(nodeItem(activeSpecNode, "active spec", PRIORITY.ACTIVE_SPEC, "spec"));

  const activePlanNode = ctx.activePlan ? findById(plansAll, ctx.activePlan.id) : undefined;
  if (activePlanNode)
    items.push(nodeItem(activePlanNode, "active plan", PRIORITY.ACTIVE_PLAN, "plan"));

  const currentTaskNode = ctx.currentTask ? findById(tasksAll, ctx.currentTask.id) : undefined;
  if (currentTaskNode)
    items.push(nodeItem(currentTaskNode, "current task", PRIORITY.CURRENT_TASK, "task"));

  // 3. Decisions backlinked to the active spec / active plan.
  const backlinks = await computeBacklinks(repoRoot, cfg);
  const decisionsAll = await listNodeFiles(repoRoot, cfg, "decision");
  const seen = new Set(items.map((i) => i.id));
  const seedTargets = [ctx.activeSpec?.id, ctx.activePlan?.id].filter(
    (x): x is string => typeof x === "string",
  );
  for (const target of seedTargets) {
    const refs = backlinks.get(target) ?? [];
    for (const ref of refs) {
      if (ref.fromType !== "decision") continue;
      if (seen.has(ref.from)) continue;
      const node = decisionsAll.find((n) => n.id === ref.from);
      if (!node) continue;
      items.push(
        nodeItem(node, `linked from ${target}`, PRIORITY.BACKLINKED_DECISION, "decision"),
      );
      seen.add(ref.from);
    }
  }

  // 4. Open questions.
  const questionsAll = await listNodeFiles(repoRoot, cfg, "question");
  for (const q of questionsAll) {
    if (String(q.frontmatter.status ?? "") !== "open") continue;
    if (seen.has(q.id)) continue;
    items.push(nodeItem(q, "open question", PRIORITY.OPEN_QUESTION, "question"));
    seen.add(q.id);
  }

  // 5. Recent N sessions.
  const sessionsAll = (await listNodeFiles(repoRoot, cfg, "session")).slice().sort(compareSessionDateDesc);
  for (const s of sessionsAll.slice(0, recentLimit)) {
    if (seen.has(s.id)) continue;
    items.push(nodeItem(s, `recent session (last ${recentLimit})`, PRIORITY.RECENT_SESSION, "session"));
    seen.add(s.id);
  }

  // 6. Trim by token budget; never drop priority-1 items.
  const trimResult = trimToBudget(items, tokenBudget);

  const builtAt = new Date().toISOString();
  return {
    task,
    packId: makePackId(task, builtAt),
    builtAt,
    items: trimResult.items,
    tokenEstimate: trimResult.tokenEstimate,
    trimmedItems: trimResult.trimmedItems,
    tokenBudget,
    warnings: ctx.warnings,
  };
}

export { estimateTokens };
