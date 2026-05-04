import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { computeBacklinks } from "../backlinks.js";
import type { Config } from "../config.js";
import { buildActiveContext } from "../indexes/activeContext.js";
import { centralVaultRootForProject, rulesDirForProject } from "../paths.js";
import type { NodeType } from "../types.js";
import { type NodeFile, listNodeFiles } from "../vault.js";
import { estimateTokens, trimToBudget } from "./budget.js";
import {
  type BuildContextPackInput,
  type ContextPackItem,
  type ContextPackOutput,
  OPERATING_RULE_BODY_CAP,
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

const NODE_ID_RE = /\b[A-Z]+-\d+\b/g;
const STOP_WORDS = new Set([
  "and",
  "for",
  "from",
  "into",
  "the",
  "this",
  "that",
  "with",
  "task",
  "fix",
  "work",
  "make",
  "use",
  "using",
]);

function tokenize(input: string): string[] {
  const tokens = input.toLowerCase().match(/[a-z0-9]+/g);
  if (!tokens) return [];
  return Array.from(new Set(tokens.filter((t) => t.length >= 2 && !STOP_WORDS.has(t))));
}

function titleOf(node: NodeFile): string {
  return String(node.frontmatter.title ?? node.id);
}

function linkTargets(node: NodeFile): string[] {
  const links = node.frontmatter.links;
  const out = new Set<string>();
  if (Array.isArray(links)) {
    for (const link of links) {
      if (typeof link === "string") {
        NODE_ID_RE.lastIndex = 0;
        let match = NODE_ID_RE.exec(link);
        while (match) {
          if (match[0]) out.add(match[0]);
          match = NODE_ID_RE.exec(link);
        }
        NODE_ID_RE.lastIndex = 0;
        continue;
      }
      if (!link || typeof link !== "object") continue;
      const target = (link as { target?: unknown }).target;
      if (typeof target === "string") out.add(target);
    }
  }
  NODE_ID_RE.lastIndex = 0;
  let match = NODE_ID_RE.exec(node.body);
  while (match) {
    if (match[0]) out.add(match[0]);
    match = NODE_ID_RE.exec(node.body);
  }
  NODE_ID_RE.lastIndex = 0;
  return Array.from(out);
}

function scoreNodeForTaskHint(node: NodeFile, taskHint: string): number {
  const tokens = tokenize(taskHint);
  if (tokens.length === 0) return 0;
  const titleTokens = new Set(tokenize(`${node.id} ${titleOf(node)}`));
  const bodyTokens = new Set(tokenize(node.body.slice(0, 4000)));
  let score = titleOf(node).toLowerCase().includes(taskHint.toLowerCase()) ? 6 : 0;
  for (const token of tokens) {
    if (titleTokens.has(token)) score += 3;
    else if (bodyTokens.has(token)) score += 1;
  }
  return score;
}

function findByIdInLists(lists: NodeFile[][], id: string): NodeFile | undefined {
  for (const list of lists) {
    const hit = list.find((n) => n.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function resolveTaskHintNodes(taskHint: string | undefined, lists: NodeFile[][]): NodeFile[] {
  const hint = taskHint?.trim();
  if (!hint || hint === "(no task)" || hint === "untitled") return [];

  const byDirectId = new Map<string, NodeFile>();
  NODE_ID_RE.lastIndex = 0;
  let match = NODE_ID_RE.exec(hint);
  while (match) {
    const id = match[0];
    const node = findByIdInLists(lists, id);
    if (node) byDirectId.set(node.id, node);
    match = NODE_ID_RE.exec(hint);
  }
  NODE_ID_RE.lastIndex = 0;
  if (byDirectId.size > 0) return Array.from(byDirectId.values());

  const candidates = lists.flat();
  const scored = candidates
    .map((node) => ({ node, score: scoreNodeForTaskHint(node, hint) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id));
  const best = scored[0];
  if (!best) return [];
  const threshold = tokenize(hint).length <= 1 ? 4 : 5;
  if (best.score < threshold) return [];
  return scored
    .filter((x) => x.score === best.score)
    .slice(0, 3)
    .map((x) => x.node);
}

async function collectOperatingRules(
  repoRoot: string,
  scope: "vault" | "project",
): Promise<ContextPackItem[]> {
  const dir = rulesDirForProject(repoRoot);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: ContextPackItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(dir, entry.name);
    const raw = await readFile(path, "utf8");
    const body =
      raw.length > OPERATING_RULE_BODY_CAP
        ? `${raw.slice(0, OPERATING_RULE_BODY_CAP)}\n\n…(truncated; full file at ${entry.name})`
        : raw;
    const name = basename(entry.name, ".md");
    out.push({
      type: "operating-rule",
      id: `rule:${name}`,
      title: name,
      reason: `operating rule (${scope})`,
      reasonPriority: PRIORITY.OPERATING_RULE,
      body,
    });
  }
  // Stable ordering so packs with identical inputs stay byte-identical.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function projectStateBody(ctx: Awaited<ReturnType<typeof buildActiveContext>>): {
  title: string;
  body: string;
} {
  const lines: string[] = [];
  lines.push(`Phase: ${ctx.phase}`);
  if (ctx.phaseSince) lines.push(`Phase since: ${ctx.phaseSince}`);
  if (ctx.activeGoal) lines.push(`Active goal: ${ctx.activeGoal.id} — ${ctx.activeGoal.title}`);
  if (ctx.activeSpec)
    lines.push(
      `Active spec: ${ctx.activeSpec.id} (${ctx.activeSpec.status}) — ${ctx.activeSpec.title}`,
    );
  if (ctx.activePlan) {
    const cur = ctx.activePlan.currentTaskId ? ` → current ${ctx.activePlan.currentTaskId}` : "";
    lines.push(`Active plan: ${ctx.activePlan.id} — ${ctx.activePlan.title}${cur}`);
  }
  if (ctx.currentTask)
    lines.push(
      `Current task: ${ctx.currentTask.id} — ${ctx.currentTask.title} (${ctx.currentTask.status})`,
    );
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

  // 1b. Operating rules — vault-shared markdown the user has authored telling the
  //     agent how to behave in this project. High priority so a token budget never
  //     drops them; each body capped to OPERATING_RULE_BODY_CAP chars to keep budget honest.
  const ruleScope = centralVaultRootForProject(repoRoot) ? "vault" : "project";
  const rulesItems = await collectOperatingRules(repoRoot, ruleScope);
  for (const it of rulesItems) items.push(it);

  // 2. Active spec, plan, task, goal node bodies (full).
  const specsAll = await listNodeFiles(repoRoot, cfg, "spec");
  const plansAll = await listNodeFiles(repoRoot, cfg, "plan");
  const tasksAll = await listNodeFiles(repoRoot, cfg, "task");
  const goalsAll = await listNodeFiles(repoRoot, cfg, "goal");
  const decisionsAll = await listNodeFiles(repoRoot, cfg, "decision");
  const insightsAll = await listNodeFiles(repoRoot, cfg, "insight");
  const questionsAll = await listNodeFiles(repoRoot, cfg, "question");

  const findById = (list: NodeFile[], id: string | undefined) =>
    id ? list.find((n) => n.id === id) : undefined;
  const focusSearchLists = [
    tasksAll,
    specsAll,
    plansAll,
    goalsAll,
    decisionsAll,
    insightsAll,
    questionsAll,
  ];
  const seen = new Set(items.map((i) => i.id));
  const focusTargets = new Set<string>();
  const appendNode = (
    node: NodeFile | undefined,
    reason: string,
    reasonPriority: number,
    type: NodeType,
  ) => {
    if (!node || seen.has(node.id)) return false;
    items.push(nodeItem(node, reason, reasonPriority, type));
    seen.add(node.id);
    focusTargets.add(node.id);
    return true;
  };

  const activeGoalNode = ctx.activeGoal ? findById(goalsAll, ctx.activeGoal.id) : undefined;
  appendNode(activeGoalNode, "active goal", PRIORITY.ACTIVE_GOAL, "goal");

  const activeSpecNode = ctx.activeSpec ? findById(specsAll, ctx.activeSpec.id) : undefined;
  appendNode(activeSpecNode, "active spec", PRIORITY.ACTIVE_SPEC, "spec");

  const activePlanNode = ctx.activePlan ? findById(plansAll, ctx.activePlan.id) : undefined;
  appendNode(activePlanNode, "active plan", PRIORITY.ACTIVE_PLAN, "plan");

  const currentTaskNode = ctx.currentTask ? findById(tasksAll, ctx.currentTask.id) : undefined;
  appendNode(currentTaskNode, "current task", PRIORITY.CURRENT_TASK, "task");

  // 2b. User-requested task/focus hint. A direct ID (TASK-007, PLAN-001, etc.)
  //     wins. Otherwise we fuzzy-match the hint against task titles first, then
  //     the rest of the durable nodes. This turns `cairndex context TASK-123`
  //     and `cairndex context "fix web e2e"` into an actually focused pack.
  const requestedNodes = resolveTaskHintNodes(input.task, focusSearchLists);
  for (const node of requestedNodes) {
    appendNode(node, "requested by context hint", PRIORITY.REQUESTED_NODE, node.type);
    for (const target of linkTargets(node)) {
      const linked = findByIdInLists(focusSearchLists, target);
      if (linked) {
        appendNode(
          linked,
          `linked from requested ${node.id}`,
          PRIORITY.LINKED_FOCUS_NODE,
          linked.type,
        );
      } else {
        focusTargets.add(target);
      }
    }
  }

  // 3. Decisions/insights/open questions backlinked to active or requested focus.
  const backlinks = await computeBacklinks(repoRoot, cfg);
  const seedTargets = [ctx.activeSpec?.id, ctx.activePlan?.id, ...focusTargets].filter(
    (x): x is string => typeof x === "string",
  );
  for (const target of seedTargets) {
    const refs = backlinks.get(target) ?? [];
    for (const ref of refs) {
      if (seen.has(ref.from)) continue;
      if (ref.fromType === "decision") {
        const node = decisionsAll.find((n) => n.id === ref.from);
        appendNode(node, `linked from ${target}`, PRIORITY.BACKLINKED_DECISION, "decision");
      } else if (ref.fromType === "insight") {
        const node = insightsAll.find((n) => n.id === ref.from);
        appendNode(node, `linked insight for ${target}`, PRIORITY.BACKLINKED_INSIGHT, "insight");
      } else if (ref.fromType === "question") {
        const node = questionsAll.find((n) => n.id === ref.from);
        if (node && String(node.frontmatter.status ?? "") === "open") {
          appendNode(
            node,
            `linked open question for ${target}`,
            PRIORITY.RELATED_OPEN_QUESTION,
            "question",
          );
        }
      }
    }
  }

  // 4. Open questions.
  for (const q of questionsAll) {
    if (String(q.frontmatter.status ?? "") !== "open") continue;
    appendNode(q, "open question", PRIORITY.OPEN_QUESTION, "question");
  }

  // 5. Recent N sessions.
  const sessionsAll = (await listNodeFiles(repoRoot, cfg, "session"))
    .slice()
    .sort(compareSessionDateDesc);
  for (const s of sessionsAll.slice(0, recentLimit)) {
    if (seen.has(s.id)) continue;
    items.push(
      nodeItem(s, `recent session (last ${recentLimit})`, PRIORITY.RECENT_SESSION, "session"),
    );
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
