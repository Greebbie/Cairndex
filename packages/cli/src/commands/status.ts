import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  buildActiveContext,
  buildMemoryHealth,
  defaultConfig,
  listProposals,
  loadProjectConfig,
  projectIdFromRoot,
  readIntent,
  scoreAllStoryCoverage,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface StatusOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  json?: boolean;
}

export interface StatusResult {
  exitCode: 0 | 1;
  message?: string;
  body?: string;
}

interface DurableMtime {
  msSinceEpoch: number | null;
  /** Human label like "2 min ago" or "just now"; null when no durable file found. */
  label: string;
}

const DURABLE_FOLDERS = [
  "goals",
  "intents",
  "specs",
  "decisions",
  "plans",
  "tasks",
  "sessions",
  "changes",
  "insights",
  "questions",
] as const;

/** Walk durable folders only one level deep — vault structure is shallow on purpose. */
async function lastDurableMtime(root: string): Promise<DurableMtime> {
  const vault = vaultPath(root);
  let latest = 0;
  for (const folder of DURABLE_FOLDERS) {
    const dir = join(vault, folder);
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      try {
        const m = statSync(join(dir, name)).mtimeMs;
        if (m > latest) latest = m;
      } catch {
        // ignore unreadable files
      }
    }
  }
  if (latest === 0) return { msSinceEpoch: null, label: "(no durable nodes yet)" };
  return { msSinceEpoch: latest, label: humanizeRelative(latest, Date.now()) };
}

/** Compact relative-time formatter. Avoids Intl in case the runtime locale is exotic. */
export function humanizeRelative(then: number, now: number): string {
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.round(diffMo / 12)}y ago`;
}

function pad(label: string, width: number): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

export async function runStatus(opts: StatusOptions): Promise<StatusResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();
  const [ctx, health, inbox, lastChange, intent, storyCoverage] = await Promise.all([
    buildActiveContext(root, cfg),
    buildMemoryHealth(root, cfg),
    listProposals(root, cfg),
    lastDurableMtime(root),
    readIntent(root),
    scoreAllStoryCoverage({ cwd: root }),
  ]);
  const projectId = opts.projectId ?? projectIdFromRoot(root);

  if (opts.json) {
    return {
      exitCode: 0,
      body: JSON.stringify(
        {
          projectId,
          phase: ctx.phase,
          phaseSince: ctx.phaseSince,
          activeSpec: ctx.activeSpec,
          activePlan: ctx.activePlan,
          currentTask: ctx.currentTask,
          nextAction: ctx.nextAction,
          intent,
          memory: health.counts,
          storyCoverage: storyCoverage.map((i) => ({ name: i.name, level: i.level })),
          inbox: {
            pending: inbox.pending.length,
            accepted: inbox.accepted.length,
            rejected: inbox.rejected.length,
            duplicate: inbox.duplicate.length,
          },
          lastChange,
          warnings: ctx.warnings,
        },
        null,
        2,
      ),
    };
  }

  const lines: string[] = [];
  const header = `Cairndex status — ${projectId ?? "(no project)"}`;
  lines.push(header);
  lines.push("─".repeat(Math.min(60, header.length + 4)));
  lines.push(
    `${pad("Phase:", 14)}${ctx.phase}${ctx.phaseSince ? ` (since ${ctx.phaseSince})` : ""}`,
  );
  lines.push(
    `${pad("Active spec:", 14)}${ctx.activeSpec ? `${ctx.activeSpec.id} (${ctx.activeSpec.status || "—"})` : "—"}`,
  );
  if (ctx.activePlan) {
    const taskBit = ctx.currentTask
      ? ` → ${ctx.currentTask.id} (${ctx.currentTask.status || "—"})`
      : "";
    lines.push(`${pad("Active plan:", 14)}${ctx.activePlan.id}${taskBit}`);
  } else {
    lines.push(`${pad("Active plan:", 14)}—`);
  }
  lines.push(`${pad("Next action:", 14)}${ctx.nextAction ?? "—"}`);
  if (intent && intent.steps.length > 0) {
    lines.push("");
    lines.push("Intent (this turn):");
    intent.steps.forEach((step, i) => {
      lines.push(`  ${i + 1}. ${step}`);
    });
  }
  lines.push("");
  lines.push(
    `${pad("Memory:", 14)}${health.counts.green} green  ${health.counts.yellow} yellow  ${health.counts.red} red`,
  );
  const storyFlags = storyCoverage.filter((i) => i.level !== "green");
  if (storyFlags.length > 0) {
    lines.push(
      `${pad("Story:", 14)}${storyFlags.map((f) => `${f.name}: ${f.level}`).join(", ")}`,
    );
  } else {
    lines.push(`${pad("Story:", 14)}all green`);
  }
  lines.push(
    `${pad("Inbox:", 14)}${inbox.pending.length} pending  ${inbox.accepted.length} accepted  ${inbox.rejected.length} rejected`,
  );
  lines.push(`${pad("Last change:", 14)}${lastChange.label}`);
  if (ctx.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of ctx.warnings) lines.push(`  - ${w}`);
  }
  return { exitCode: 0, body: lines.join("\n") };
}
