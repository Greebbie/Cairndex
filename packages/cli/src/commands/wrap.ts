import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  buildActiveContext,
  defaultConfig,
  listProposals,
  loadProjectConfig,
  projectIdFromRoot,
  runValidation,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import kleur from "kleur";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

/**
 * `cairndex wrap` — close-out report (read-only) the user runs (or asks the agent
 * to run) before closing a session. Aggregates signals that are otherwise scattered
 * across `cairndex status`, `cairndex doctor`, `cairndex inbox list`, and the latest
 * session note's `## Next` block, and surfaces them on one screen.
 *
 * Pure report. No mutations. No heuristic guesses about whether the user "really
 * meant" something — informational echoes ("active task: TASK-001 pending — if done,
 * run X") rather than guesses ("looks like you finished, run X for me").
 *
 * The Stop hook chain still does the actual descriptive capture (session note, sweep,
 * insight distillation, context-pack rebuild). This command answers "did the agent
 * leave forwarding info?" — the prescriptive side, which the auto-pipeline doesn't
 * cover.
 */
export interface WrapOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  json?: boolean;
}

interface WrapCheck {
  /** Display label, kept short (≤14 chars) so columns line up. */
  label: string;
  /**
   * Status:
   *  - ok    → green ✓ (clean / forward-pickup ready)
   *  - warn  → yellow ⚠ (advisory; user should look at it before closing)
   *  - error → red ✗ (vault-level problem like Doctor errors; close-out is risky)
   *  - info  → dim · (neutral context, no signal about close-out readiness)
   */
  status: "ok" | "warn" | "error" | "info";
  /** One-line message; multi-line follow-ups go under `details`. */
  message: string;
  /** Optional indented action hints (e.g. "↳ if done, run: ..."). */
  details?: string[];
}

export interface WrapResult {
  exitCode: 0 | 1;
  message?: string;
  body?: string;
  /** Structured payload (always present unless setup is broken). */
  report?: {
    projectId: string | null;
    checks: WrapCheck[];
    counts: { ok: number; warn: number; error: number; info: number };
  };
}

/**
 * Locate the latest session note by mtime in <vault>/sessions/.
 * Returns null when the folder is empty/missing — most "fresh project" case.
 */
async function findLatestSessionFile(vault: string): Promise<string | null> {
  const dir = join(vault, "sessions");
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  let latestPath: string | null = null;
  let latestMtime = 0;
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const p = join(dir, name);
    try {
      const m = statSync(p).mtimeMs;
      if (m > latestMtime) {
        latestMtime = m;
        latestPath = p;
      }
    } catch {
      // ignore unreadable entries
    }
  }
  return latestPath;
}

/**
 * Count bullet items under a `## Next` heading in a session note. Stops at the next
 * heading of any level. Returns 0 when there's no `## Next` heading or it's empty.
 *
 * Tolerates both `- `, `* `, and numbered (`1. `) bullet forms — the existing
 * session-log scaffolding can produce any of these depending on the agent.
 */
function countNextBullets(body: string): number {
  const lines = body.split("\n");
  let inNext = false;
  let count = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+Next\b/i.test(line)) {
      inNext = true;
      continue;
    }
    if (inNext && /^#{1,6}\s+/.test(line)) {
      // Next heading starts — section ended.
      break;
    }
    if (inNext) {
      const trimmed = line.trim();
      if (/^([-*]|\d+\.)\s+\S+/.test(trimmed)) count += 1;
    }
  }
  return count;
}

function fmtStatus(check: WrapCheck): string {
  switch (check.status) {
    case "ok":
      return kleur.green("✓");
    case "warn":
      return kleur.yellow("⚠");
    case "error":
      return kleur.red("✗");
    case "info":
      return kleur.dim("·");
  }
}

function pad(label: string, width: number): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

export async function runWrap(opts: WrapOptions): Promise<WrapResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const cfg = existsSync(join(vaultPath(root), "config.yaml"))
    ? loadProjectConfig(root)
    : defaultConfig();

  // Run all reads in parallel — wrap is meant to be snappy, none of these mutate.
  const [ctx, inbox, validation, latestSession] = await Promise.all([
    buildActiveContext(root, cfg),
    listProposals(root, cfg),
    runValidation(root, cfg),
    findLatestSessionFile(vaultPath(root)),
  ]);
  const projectId = opts.projectId ?? projectIdFromRoot(root);

  const checks: WrapCheck[] = [];

  // Phase + active task: informational echoes — wrap doesn't try to guess whether
  // the user "should" change phase / complete the task. The user reads, decides.
  checks.push({
    label: "Phase",
    status: "info",
    message: ctx.phaseSince ? `${ctx.phase} (since ${ctx.phaseSince})` : ctx.phase,
  });

  if (ctx.currentTask) {
    const t = ctx.currentTask;
    const taskCheck: WrapCheck = {
      label: "Active task",
      status: "info",
      message: `${t.id} (${t.status || "—"}) — ${t.title}`,
    };
    if (t.status === "pending" || t.status === "in_progress") {
      taskCheck.details = [`if done, run: cairndex task complete ${t.id}`];
    }
    checks.push(taskCheck);
  } else {
    checks.push({
      label: "Active task",
      status: "info",
      message: "—",
    });
  }

  if (ctx.nextAction) {
    checks.push({ label: "Next action", status: "info", message: ctx.nextAction });
  } else {
    checks.push({
      label: "Next action",
      status: "warn",
      message: "no next action recorded",
      details: ["agent should set ctx.nextAction or update the active spec/plan"],
    });
  }

  // Last session note "## Next" completeness — the most actionable forward-pickup signal.
  if (latestSession) {
    let nextBulletCount = 0;
    try {
      const body = await readFile(latestSession, "utf8");
      nextBulletCount = countNextBullets(body);
    } catch {
      // unreadable — skip with a warn rather than a hard fail
    }
    const sessionId = latestSession.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/, "");
    if (nextBulletCount > 0) {
      checks.push({
        label: "Session next",
        status: "ok",
        message: `${sessionId} · ## Next has ${nextBulletCount} bullet${nextBulletCount === 1 ? "" : "s"}`,
      });
    } else {
      checks.push({
        label: "Session next",
        status: "warn",
        message: `${sessionId} · ## Next is empty`,
        details: [
          "what should the next session pick up? add bullets via",
          'cairndex session log progress --text "..." (or ask the agent)',
        ],
      });
    }
  } else {
    checks.push({
      label: "Session next",
      status: "info",
      message: "(no session notes yet)",
    });
  }

  // Inbox: count pending. Heuristic-noise vs decision-needed distinction is left
  // to /inbox the visit; here a simple count is enough for a close-out vibe check.
  if (inbox.pending.length === 0) {
    checks.push({ label: "Inbox", status: "ok", message: "0 pending" });
  } else {
    const head = inbox.pending.slice(0, 3).map((p) => `${p.proposalId}: ${p.summary}`);
    checks.push({
      label: "Inbox",
      status: "warn",
      message: `${inbox.pending.length} pending`,
      details: [
        ...head,
        ...(inbox.pending.length > 3 ? [`...and ${inbox.pending.length - 3} more`] : []),
        "review at /inbox or run: cairndex inbox list",
      ],
    });
  }

  // Doctor: count by severity. Errors block reasoning about vault hygiene (a node
  // collision or schema break invalidates everything below it), so they get the
  // strongest signal. Warnings are advisory and surface as warn.
  const errorCount = validation.filter((i) => i.severity === "error").length;
  const warnCount = validation.filter((i) => i.severity === "warn").length;
  if (errorCount === 0 && warnCount === 0) {
    checks.push({ label: "Doctor", status: "ok", message: "vault is clean" });
  } else {
    checks.push({
      label: "Doctor",
      status: errorCount > 0 ? "error" : "warn",
      message: `${errorCount} error${errorCount === 1 ? "" : "s"}, ${warnCount} warning${warnCount === 1 ? "" : "s"}`,
      details: ["run: cairndex doctor --fix  (auto-fixes safe issues)"],
    });
  }

  const counts = {
    ok: checks.filter((c) => c.status === "ok").length,
    warn: checks.filter((c) => c.status === "warn").length,
    error: checks.filter((c) => c.status === "error").length,
    info: checks.filter((c) => c.status === "info").length,
  };

  if (opts.json) {
    return {
      exitCode: 0,
      report: { projectId, checks, counts },
      body: JSON.stringify({ projectId, checks, counts }, null, 2),
    };
  }

  const lines: string[] = [];
  const header = `Cairndex wrap — ${projectId ?? "(no project)"}`;
  lines.push(header);
  lines.push("─".repeat(Math.min(60, header.length + 4)));
  for (const c of checks) {
    lines.push(`${fmtStatus(c)} ${pad(`${c.label}:`, 14)}${c.message}`);
    if (c.details) {
      for (const d of c.details) lines.push(`     ${kleur.dim("↳")} ${kleur.dim(d)}`);
    }
  }
  lines.push("");
  if (counts.error > 0) {
    // Errors are stronger than warnings — close-out is risky until they're cleared.
    lines.push(
      kleur.red(
        `${counts.error} error${counts.error === 1 ? "" : "s"} above — fix before closing.`,
      ),
    );
  } else if (counts.warn > 0) {
    lines.push(
      kleur.yellow(
        `${counts.warn} warning${counts.warn === 1 ? "" : "s"} above — consider addressing before closing.`,
      ),
    );
  } else {
    lines.push(kleur.green(`Looks ready to close. (${counts.ok} ✓, ${counts.info} info)`));
  }

  return {
    exitCode: 0,
    body: lines.join("\n"),
    report: { projectId, checks, counts },
  };
}
