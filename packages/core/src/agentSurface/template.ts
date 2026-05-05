import type { ActiveContext } from "../indexes/activeContext.js";
import type { MemoryHealth } from "../indexes/memoryHealth.js";
import { LEGACY_PROJECT_ID, inboxProposalsHint } from "./layoutHints.js";

/**
 * Render the Recommended-set agent-surface body. This is what goes inside the
 * `<!-- cairndex:start v1 --> ... <!-- cairndex:end -->` region of CLAUDE.md.
 *
 * Per design: phase + active goal/spec/plan/task + next action + a single
 * memory-health line + the `cairndex context` command hint + an inbox-proposal note.
 * Open questions and superseded warnings are deferred to v0.2.
 */
export function renderAgentSurface(
  ctx: ActiveContext,
  health: MemoryHealth,
  projectId: string = LEGACY_PROJECT_ID,
): string {
  const lines: string[] = [];
  lines.push(`Phase: ${ctx.phase}`);
  if (ctx.activeGoal) lines.push(`Active goal: ${ctx.activeGoal.id} — ${ctx.activeGoal.title}`);
  if (ctx.activeSpec)
    lines.push(`Active spec: ${ctx.activeSpec.id} (status: ${ctx.activeSpec.status})`);
  if (ctx.activePlan) {
    const cur = ctx.activePlan.currentTaskId ? ` → current ${ctx.activePlan.currentTaskId}` : "";
    lines.push(`Active plan: ${ctx.activePlan.id}${cur}`);
  }
  if (ctx.currentTask) lines.push(`Current task: ${ctx.currentTask.id} — ${ctx.currentTask.title}`);
  if (ctx.nextAction) lines.push(`Next action: ${ctx.nextAction}`);
  lines.push("");
  lines.push(
    `Memory health: green ${health.counts.green}  yellow ${health.counts.yellow}  red ${health.counts.red}`,
  );
  lines.push(`For full task context: \`cairndex context "<task>"\``);
  lines.push("");
  lines.push("Note: durable memory changes (decisions, specs, insights, plan/task state)");
  lines.push(`should propose through \`${inboxProposalsHint(projectId)}\``);
  lines.push("unless the user explicitly accepts inline.");
  lines.push("");
  lines.push("Pre-flight intent: before any non-trivial work (>1 file edit or >2 tool calls of");
  lines.push('planning), run `cairndex intent set "step1; step2; step3"` (≤3 steps, ≤80 chars');
  lines.push("each). The banner prints into the user's conversation so they can interrupt");
  lines.push("if you're heading the wrong way. The Stop hook clears it at end-of-turn.");
  lines.push("");
  lines.push("Session wrap-up: when the user signals close-out (`/wrap`, 'wrap up',");
  lines.push("'close out'), run `cairndex wrap` to get a read-only report. For each ⚠ warning,");
  lines.push("propose the matching mutation (task complete / session log / doctor --fix /");
  lines.push("inbox triage) and ask before executing. Wrap is read-then-suggest, not auto-fix.");
  return lines.join("\n");
}
