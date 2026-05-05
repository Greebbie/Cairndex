import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.js";
import { buildContextPack } from "./contextPack/build.js";
import { findLatestPackWithStaleness } from "./contextPack/latestPack.js";
import { renderContextPack } from "./contextPack/render.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { buildHandoffReadiness, type HandoffReadiness } from "./handoffReadiness.js";
import { scoreAllStoryCoverage } from "./health/storyCoverage.js";
import { buildActiveContext } from "./indexes/activeContext.js";
import { buildMemoryHealth } from "./indexes/memoryHealth.js";
import { regenerateAllIndexes } from "./indexes/regenerate.js";
import { appendChangelog } from "./changelog.js";
import { buildResumeView } from "./resume/buildResumeView.js";
import { writeResumeCache } from "./resume/cache.js";
import { contextPacksPath, indexPath } from "./paths.js";
import { projectIdFromRoot } from "./agentSurface/layoutHints.js";
import { listNodeFiles } from "./vault.js";
import { createTask, setTaskNextAction, switchTask } from "./workflow/taskState.js";

export type HandoffRepairActionStatus = "applied" | "planned" | "skipped" | "manual";

export interface HandoffRepairAction {
  id: string;
  label: string;
  status: HandoffRepairActionStatus;
  detail: string;
  path?: string;
}

export interface HandoffRepairOptions {
  taskId?: string;
  createTaskTitle?: string;
  nextAction?: string;
  dryRun?: boolean;
  rebuildPack?: boolean;
  rebuildResume?: boolean;
}

export interface HandoffRepairResult {
  before: HandoffReadiness;
  after: HandoffReadiness;
  actions: HandoffRepairAction[];
  applied: number;
  planned: number;
  skipped: number;
  manual: number;
  createdTaskId: string | null;
  packPath: string | null;
}

async function snapshot(repoRoot: string, cfg: Config): Promise<HandoffReadiness> {
  const [projectState, memoryHealth, storyCoverage, latestPack] = await Promise.all([
    buildActiveContext(repoRoot, cfg),
    buildMemoryHealth(repoRoot, cfg),
    scoreAllStoryCoverage({ cwd: repoRoot }),
    findLatestPackWithStaleness(repoRoot),
  ]);
  return buildHandoffReadiness({
    projectState,
    memoryHealth,
    storyCoverage,
    latestPack,
  });
}

function plannedOrApplied(dryRun: boolean | undefined): HandoffRepairActionStatus {
  return dryRun ? "planned" : "applied";
}

async function repairIndexCurrentTask(
  repoRoot: string,
  cfg: Config,
  dryRun: boolean | undefined,
): Promise<HandoffRepairAction | null> {
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return null;

  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const declared =
    typeof data.current_task === "string" && data.current_task.trim().length > 0
      ? data.current_task.trim()
      : null;
  if (!declared) return null;

  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const declaredTask = tasks.find((t) => t.id === declared);
  const ctx = await buildActiveContext(repoRoot, cfg);

  let nextTaskId: string | null | undefined;
  let detail: string | null = null;
  if (!declaredTask) {
    nextTaskId = null;
    detail = `${declared} is missing; current_task will be cleared.`;
  } else {
    const status = String(declaredTask.frontmatter.status ?? "");
    if (status !== "in_progress" && status !== "pending") {
      nextTaskId = null;
      detail = `${declared} is ${status || "statusless"}; current_task will be cleared.`;
    } else if (ctx.currentTask && ctx.currentTask.id !== declared) {
      nextTaskId = ctx.currentTask.id;
      detail = `current_task will be synced from ${declared} to ${ctx.currentTask.id}.`;
    }
  }

  if (nextTaskId === undefined || detail === null) return null;
  if (!dryRun) {
    if (nextTaskId) data.current_task = nextTaskId;
    else delete data.current_task;
    await writeFile(path, serializeFrontmatter(data, content), "utf8");
    await appendChangelog(repoRoot, "handoff repair -> synced index current_task");
  }
  return {
    id: "repair-current-task-pointer",
    label: "Repair current task pointer",
    status: plannedOrApplied(dryRun),
    detail,
    path,
  };
}

async function repairIndexNextAction(
  repoRoot: string,
  cfg: Config,
  dryRun: boolean | undefined,
): Promise<HandoffRepairAction | null> {
  const path = indexPath(repoRoot);
  if (!existsSync(path)) return null;

  const ctx = await buildActiveContext(repoRoot, cfg);
  if (!ctx.currentTask) return null;

  const tasks = await listNodeFiles(repoRoot, cfg, "task");
  const current = tasks.find((t) => t.id === ctx.currentTask?.id);
  const taskNextAction =
    typeof current?.frontmatter.next_action === "string" &&
    current.frontmatter.next_action.trim().length > 0
      ? current.frontmatter.next_action.trim()
      : null;

  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const indexNextAction =
    typeof data.next_action === "string" && data.next_action.trim().length > 0
      ? data.next_action.trim()
      : null;
  if (indexNextAction === taskNextAction) return null;

  const detail = taskNextAction
    ? `index.md next_action will be synced from ${ctx.currentTask.id}.`
    : `index.md next_action will be cleared because ${ctx.currentTask.id} has no next_action.`;
  if (!dryRun) {
    if (taskNextAction) data.next_action = taskNextAction;
    else delete data.next_action;
    await writeFile(path, serializeFrontmatter(data, content), "utf8");
    await appendChangelog(repoRoot, "handoff repair -> synced index next_action");
  }
  return {
    id: "repair-index-next-action",
    label: "Repair index next action",
    status: plannedOrApplied(dryRun),
    detail,
    path,
  };
}

async function rebuildResume(
  repoRoot: string,
  dryRun: boolean | undefined,
): Promise<HandoffRepairAction> {
  if (dryRun) {
    return {
      id: "rebuild-resume",
      label: "Rebuild resume cache",
      status: "planned",
      detail: "state/resume.json and state/resume.md will be regenerated.",
    };
  }
  const view = await buildResumeView({ cwd: repoRoot });
  await writeResumeCache({ cwd: repoRoot, view });
  return {
    id: "rebuild-resume",
    label: "Rebuild resume cache",
    status: "applied",
    detail: "Resume cache regenerated from current vault state.",
  };
}

async function rebuildContextPack(
  repoRoot: string,
  cfg: Config,
  taskHint: string | undefined,
  dryRun: boolean | undefined,
): Promise<{ action: HandoffRepairAction; path: string | null }> {
  if (dryRun) {
    return {
      action: {
        id: "rebuild-context-pack",
        label: "Rebuild context pack",
        status: "planned",
        detail: "A fresh context pack will be generated for the current handoff target.",
      },
      path: null,
    };
  }

  await regenerateAllIndexes(repoRoot, cfg);
  const buildInput: Parameters<typeof buildContextPack>[2] = {};
  if (taskHint !== undefined) buildInput.task = taskHint;
  const pack = await buildContextPack(repoRoot, cfg, buildInput);
  const projectId = projectIdFromRoot(repoRoot);
  const body = renderContextPack(pack, projectId);
  const dir = contextPacksPath(repoRoot);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${pack.packId}.md`);
  await writeFile(path, body, "utf8");
  return {
    action: {
      id: "rebuild-context-pack",
      label: "Rebuild context pack",
      status: "applied",
      detail: `${pack.items.length} items, ${pack.tokenEstimate} estimated tokens.`,
      path,
    },
    path,
  };
}

export async function repairHandoff(
  repoRoot: string,
  cfg: Config,
  opts: HandoffRepairOptions = {},
): Promise<HandoffRepairResult> {
  const before = await snapshot(repoRoot, cfg);
  const actions: HandoffRepairAction[] = [];
  let selectedTaskId = opts.taskId?.trim() || undefined;
  let createdTaskId: string | null = null;
  let packPath: string | null = null;

  const createTaskTitle = opts.createTaskTitle?.trim();
  if (createTaskTitle) {
    if (opts.dryRun) {
      actions.push({
        id: "create-task",
        label: "Create task",
        status: "planned",
        detail: `A pending task will be created: ${createTaskTitle}`,
      });
    } else {
      const created = await createTask(repoRoot, cfg, {
        title: createTaskTitle,
        ...(opts.nextAction !== undefined && { nextAction: opts.nextAction }),
      });
      selectedTaskId = created.id;
      createdTaskId = created.id;
      actions.push({
        id: "create-task",
        label: "Create task",
        status: "applied",
        detail: created.summary,
        path: created.path,
      });
    }
  }

  if (selectedTaskId) {
    if (opts.dryRun) {
      actions.push({
        id: "switch-task",
        label: "Switch active task",
        status: "planned",
        detail: `${selectedTaskId} will become the active in-progress task.`,
      });
    } else {
      const switched = await switchTask(repoRoot, cfg, selectedTaskId);
      actions.push({
        id: "switch-task",
        label: "Switch active task",
        status: "applied",
        detail: switched.summary,
      });
    }
  }

  const nextAction = opts.nextAction?.trim();
  if (nextAction) {
    const ctx = selectedTaskId ? null : await buildActiveContext(repoRoot, cfg);
    const targetTaskId = selectedTaskId ?? ctx?.currentTask?.id ?? null;
    if (!targetTaskId) {
      actions.push({
        id: "set-next-action",
        label: "Set next action",
        status: "manual",
        detail: "Choose or create a task first; task next_action is the handoff source of truth.",
      });
    } else if (opts.dryRun) {
      actions.push({
        id: "set-next-action",
        label: "Set next action",
        status: "planned",
        detail: `${targetTaskId} next_action will be set.`,
      });
    } else {
      const updated = await setTaskNextAction(repoRoot, cfg, targetTaskId, nextAction);
      actions.push({
        id: "set-next-action",
        label: "Set next action",
        status: updated.changed ? "applied" : "skipped",
        detail: updated.summary,
        path: updated.path,
      });
    }
  }

  const pointerRepair = await repairIndexCurrentTask(repoRoot, cfg, opts.dryRun);
  if (pointerRepair) actions.push(pointerRepair);
  const nextActionRepair = await repairIndexNextAction(repoRoot, cfg, opts.dryRun);
  if (nextActionRepair) actions.push(nextActionRepair);

  if (opts.rebuildResume !== false) {
    actions.push(await rebuildResume(repoRoot, opts.dryRun));
  }

  if (opts.rebuildPack !== false) {
    const latest = await findLatestPackWithStaleness(repoRoot);
    const shouldRebuild =
      !latest ||
      latest.stale ||
      actions.some(
        (a) =>
          a.status === "applied" &&
          (a.id === "create-task" ||
            a.id === "switch-task" ||
            a.id === "set-next-action" ||
            a.id === "repair-current-task-pointer"),
      );
    if (shouldRebuild || opts.dryRun) {
      const ctx = await buildActiveContext(repoRoot, cfg);
      const hint = selectedTaskId ?? ctx.currentTask?.id ?? ctx.nextAction ?? undefined;
      const rebuilt = await rebuildContextPack(repoRoot, cfg, hint, opts.dryRun);
      actions.push(rebuilt.action);
      packPath = rebuilt.path;
    } else {
      actions.push({
        id: "rebuild-context-pack",
        label: "Rebuild context pack",
        status: "skipped",
        detail: "Latest context pack is already current.",
        path: latest.path,
      });
      packPath = latest.path;
    }
  }

  if (!opts.dryRun) await regenerateAllIndexes(repoRoot, cfg);
  const after = await snapshot(repoRoot, cfg);
  const count = (status: HandoffRepairActionStatus) =>
    actions.filter((a) => a.status === status).length;
  return {
    before,
    after,
    actions,
    applied: count("applied"),
    planned: count("planned"),
    skipped: count("skipped"),
    manual: count("manual"),
    createdTaskId,
    packPath,
  };
}
