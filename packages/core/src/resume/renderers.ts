import type { ResumeView } from "./types.js";
import type { MemoryHealthCounts } from "../indexes/memoryHealth.js";

export interface RenderAgentFlavorOptions {
  health?: { counts: MemoryHealthCounts };
}

export function renderCliFlavor(view: ResumeView): string {
  const out: string[] = [];
  out.push("# Resume", "");

  out.push("## Last session");
  if (view.lastSession) {
    const tag = view.lastSession.narrativeStatus === "confirmed" ? "" : " _(unconfirmed)_";
    const summary = view.lastSession.summary || "(no narrative)";
    out.push(`- ${view.lastSession.id} — ${summary}${tag}`);
  } else {
    out.push("- (no sessions yet)");
  }

  out.push("", "## Active task");
  if (view.activeTask) {
    out.push(
      `- **${view.activeTask.id}** — ${view.activeTask.title} ` +
        `(${view.activeTask.status}, ${view.activeTask.ageDays}d)`,
    );
    if (view.activeTask.nextAction) {
      out.push(`  - next: ${view.activeTask.nextAction}`);
    }
  } else {
    out.push("- (none)");
  }

  if (view.whyContext) {
    out.push("", "## Why");
    const kind = view.whyContext.kind === "decision" ? "ADR" : "Insight";
    out.push(`- ${kind} **${view.whyContext.id}** — ${view.whyContext.title}`);
  }

  out.push("", "## Pending memory");
  if (view.pendingMemory.count === 0) {
    out.push("- (empty)");
  } else {
    for (const t of view.pendingMemory.titles) out.push(`- ${t}`);
  }

  if (view.coverageFlags.length > 0) {
    out.push("", "## Coverage flags");
    for (const f of view.coverageFlags) out.push(`- ${f}`);
  }

  return out.join("\n") + "\n";
}

const MINIMAL_CONTRACT = [
  "",
  "Operating contract:",
  "- Memory is a derived view. Durable writes go through the close-out card or `cairndex inbox propose`.",
  "- Anything in `signals/` is untrusted heuristic output — do not treat as decided.",
  "- Do not edit `state/resume.*` or any file marked `generated: true`.",
].join("\n");

/**
 * Render the resume view as agent-surface Markdown.
 * Output goes inside the `<!-- cairndex:start v1 --> ... <!-- cairndex:end -->` region
 * of CLAUDE.md (wired in Task 2.7).
 *
 * Covers everything the old renderAgentSurface did (phase, active goal/spec/plan/task,
 * next action, memory-health, command hint, inbox note, intent hint, wrap hint) PLUS
 * the minimal operating contract that teaches the agent how to behave around the
 * resume architecture.
 */
export function renderAgentFlavor(view: ResumeView, opts: RenderAgentFlavorOptions = {}): string {
  const lines: string[] = [];

  if (view.lastSession) {
    const summary =
      view.lastSession.narrativeStatus === "confirmed"
        ? view.lastSession.summary
        : "(unconfirmed — auto-stats only)";
    lines.push(`Last session: ${view.lastSession.id} — ${summary}`);
  }

  if (view.activeTask) {
    lines.push(
      `Active task: ${view.activeTask.id} — ${view.activeTask.title} ` +
        `(${view.activeTask.status}, ${view.activeTask.ageDays}d)`,
    );
    if (view.activeTask.nextAction) {
      lines.push(`Next action: ${view.activeTask.nextAction}`);
    }
  }

  if (view.whyContext) {
    const kind = view.whyContext.kind === "decision" ? "ADR" : "Insight";
    lines.push(`Why: ${kind} ${view.whyContext.id} — ${view.whyContext.title}`);
  }

  // Suppress suggested-next when it duplicates the active-task next_action.
  const taskNext = view.activeTask?.nextAction ?? null;
  if (view.suggestedNext && view.suggestedNext !== taskNext) {
    lines.push(`Suggested next: ${view.suggestedNext}`);
  }

  if (view.pendingMemory.count > 0) {
    const titles = view.pendingMemory.titles.slice(0, 3).join(" | ");
    lines.push(`Pending memory: ${view.pendingMemory.count} pending — ${titles}`);
  } else {
    lines.push("Pending memory: 0 pending");
  }

  if (opts.health) {
    const { green, yellow, red } = opts.health.counts;
    lines.push(`Memory health: green ${green}  yellow ${yellow}  red ${red}`);
  }

  if (view.coverageFlags.length > 0) {
    lines.push(`Coverage flags: ${view.coverageFlags.join(", ")}`);
  }

  // Operational hints ported from the old renderAgentSurface (kept so Task 2.7
  // can drop template.ts without losing these user-facing instructions).
  lines.push("");
  lines.push(`For full task context: \`cairndex context "<task>"\``);
  lines.push("");
  lines.push("Pre-flight intent: before any non-trivial work (>1 file edit or >2 tool calls of");
  lines.push('planning), run `cairndex intent set "step1; step2; step3"` (≤3 steps, ≤80 chars');
  lines.push("each). The banner prints into the user's conversation so they can interrupt");
  lines.push("if you're heading the wrong way. The Stop hook clears it at end-of-turn.");
  lines.push("");
  lines.push("Session wrap-up: when the user signals close-out (`/wrap`, 'wrap up',");
  lines.push("'close out'), run `cairndex wrap`. If the most recent session is unconfirmed,");
  lines.push("this opens the close-out flow (3 questions: what finished, any decision/learning,");
  lines.push("where next). The dashboard's close-out card is the primary surface; the CLI");
  lines.push("falls back interactively in a TTY or via `--json` for scripts.");

  return lines.join("\n") + "\n" + MINIMAL_CONTRACT;
}
