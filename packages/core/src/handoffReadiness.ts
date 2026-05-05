import type { LatestPackWithStaleness } from "./contextPack/latestPack.js";
import type { CoverageIndicator } from "./health/storyCoverage.js";
import type { ActiveContext } from "./indexes/activeContext.js";
import type { MemoryHealth } from "./indexes/memoryHealth.js";

export type HandoffReadinessLevel = "ready" | "attention" | "blocked";
export type HandoffReadinessSeverity = "info" | "warning" | "blocker";

export interface HandoffReadinessCheck {
  id: string;
  severity: HandoffReadinessSeverity;
  label: string;
  detail: string;
  action: string;
}

export interface HandoffReadiness {
  level: HandoffReadinessLevel;
  title: string;
  summary: string;
  checks: HandoffReadinessCheck[];
  blockers: number;
  warnings: number;
  ready: boolean;
}

export interface BuildHandoffReadinessInput {
  projectState: ActiveContext;
  memoryHealth: MemoryHealth;
  storyCoverage: CoverageIndicator[];
  latestPack: LatestPackWithStaleness | null;
}

function storyAction(name: string): string {
  switch (name) {
    case "recent-narrative":
      return "Close out or confirm recent sessions so resume is trustworthy.";
    case "active-task-progress":
      return "Touch or switch the active task before handing work to an agent.";
    case "next-action-defined":
      return "Set an active task with a concrete next_action.";
    case "inbox-hygiene":
      return "Accept or reject pending proposals until the inbox is small enough to scan.";
    case "resume-consumption":
      return "Open the dashboard or run cairndex resume to regenerate the resume surface.";
    default:
      return "Review the story coverage detail.";
  }
}

function titleFor(level: HandoffReadinessLevel): string {
  switch (level) {
    case "ready":
      return "Ready to hand off";
    case "attention":
      return "Needs attention";
    case "blocked":
      return "Handoff blocked";
  }
}

export function buildHandoffReadiness(input: BuildHandoffReadinessInput): HandoffReadiness {
  const checks: HandoffReadinessCheck[] = [];
  const { projectState, memoryHealth, storyCoverage, latestPack } = input;

  if (memoryHealth.counts.red > 0) {
    checks.push({
      id: "memory-health-red",
      severity: "blocker",
      label: "Memory health has errors",
      detail: `${memoryHealth.counts.red} red issue${memoryHealth.counts.red === 1 ? "" : "s"}`,
      action: "Run cairndex doctor --fix, then review any remaining errors.",
    });
  }

  if (memoryHealth.counts.yellow > 0) {
    checks.push({
      id: "memory-health-yellow",
      severity: "warning",
      label: "Memory health has warnings",
      detail: `${memoryHealth.counts.yellow} yellow issue${memoryHealth.counts.yellow === 1 ? "" : "s"}`,
      action: "Review warnings before a long agent session.",
    });
  }

  for (const warning of projectState.warnings) {
    checks.push({
      id: `project-state-${checks.length}`,
      severity: "blocker",
      label: "Project state is ambiguous",
      detail: warning,
      action: "Resolve the ambiguous state so every surface points at the same objective.",
    });
  }

  if (!projectState.currentTask && !projectState.nextAction) {
    checks.push({
      id: "no-current-task-or-next-action",
      severity: "blocker",
      label: "No active work target",
      detail: "There is no current task and no project next action.",
      action: "Switch to a task or set a concrete next action before handing off.",
    });
  } else if (!projectState.currentTask) {
    checks.push({
      id: "no-current-task",
      severity: "warning",
      label: "No active task",
      detail: "The project has a next action, but no task is marked in_progress or pending.",
      action: "Create or switch to a task so the agent has a durable work item.",
    });
  }

  if (!latestPack) {
    checks.push({
      id: "context-pack-missing",
      severity: "warning",
      label: "No context pack",
      detail: "No generated context pack exists for this project.",
      action: 'Run cairndex context "<task>" or compose a pack from the dashboard.',
    });
  } else if (latestPack.stale) {
    checks.push({
      id: "context-pack-stale",
      severity: "warning",
      label: "Context pack is stale",
      detail: latestPack.lastMemoryChangeAt
        ? `Latest pack was built at ${latestPack.builtAt}; memory changed at ${latestPack.lastMemoryChangeAt}.`
        : `Latest pack was built at ${latestPack.builtAt}.`,
      action: "Rebuild the pack before relying on it for a new agent session.",
    });
  }

  for (const indicator of storyCoverage) {
    if (indicator.level === "green") continue;
    checks.push({
      id: `story-${indicator.name}`,
      severity: indicator.level === "red" ? "blocker" : "warning",
      label: indicator.label,
      detail: indicator.detail,
      action: storyAction(indicator.name),
    });
  }

  const blockers = checks.filter((c) => c.severity === "blocker").length;
  const warnings = checks.filter((c) => c.severity === "warning").length;
  const level: HandoffReadinessLevel =
    blockers > 0 ? "blocked" : warnings > 0 ? "attention" : "ready";

  return {
    level,
    title: titleFor(level),
    summary:
      level === "ready"
        ? "Agent and human surfaces agree on the current objective."
        : `${blockers} blocker${blockers === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`,
    checks,
    blockers,
    warnings,
    ready: level === "ready",
  };
}
