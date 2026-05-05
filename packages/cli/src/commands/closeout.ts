import * as readline from "node:readline";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { vaultPath, prefillCloseOut, submitCloseOut } from "@cairndex/core";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface CloseOutOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  session?: string;
  json?: boolean;
  // non-interactive submit
  did?: string;
  learn?: string;
  next?: string;
  confirm?: boolean;
}

export async function runCloseOut(opts: CloseOutOptions): Promise<void> {
  const root = resolveMemoryRoot(opts);

  // Resolve session ID: explicit --session OR latest session in vault
  const sessionId = opts.session ?? (await findLatestSession(root));
  if (!sessionId) {
    process.stderr.write("No session found. Use --session <id> or run a session first.\n");
    process.exitCode = 1;
    return;
  }

  // Mode 1: --json
  if (opts.json) {
    const draft = await prefillCloseOut({
      cwd: opts.cwd,
      ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
      ...(opts.projectId !== undefined && { projectId: opts.projectId }),
      sessionId,
    });
    process.stdout.write(JSON.stringify({ sessionId, draft }, null, 2) + "\n");
    return;
  }

  // Mode 2: non-interactive submit
  if (opts.confirm) {
    const result = await submitCloseOut({
      cwd: opts.cwd,
      ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
      ...(opts.projectId !== undefined && { projectId: opts.projectId }),
      sessionId,
      answers: {
        didFinish: opts.did ?? "",
        decisionOrLearning: opts.learn ?? "",
        nextStep: opts.next ?? "",
      },
    });
    process.stdout.write(
      `Confirmed: session=${result.sessionPath}` +
        (result.proposalId ? ` proposal=${result.proposalId}` : "") +
        "\n",
    );
    return;
  }

  // Mode 3: interactive
  const draft = await prefillCloseOut({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    sessionId,
  });
  process.stdout.write(`Closing out session ${sessionId}\n`);
  process.stdout.write("Press Enter to accept the prefilled value, or type a replacement.\n");
  process.stdout.write('Type "skip" at any prompt to abort.\n\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (label: string, prefill: string): Promise<string | "skip"> =>
    new Promise((resolve) => {
      const display = prefill ? ` [${truncate(prefill, 60)}]` : "";
      rl.question(`${label}${display}\n> `, (answer) => {
        const trimmed = answer.trim();
        if (trimmed.toLowerCase() === "skip") return resolve("skip");
        resolve(trimmed === "" ? prefill : answer);
      });
    });

  const didFinish = await ask("Q1: What did this session actually finish?", draft.didFinish);
  if (didFinish === "skip") {
    rl.close();
    process.stdout.write("Skipped.\n");
    return;
  }

  const decisionOrLearning = await ask(
    "Q2: Any decision or learning worth keeping? (optional, leave blank to skip)",
    draft.decisionOrLearning,
  );
  if (decisionOrLearning === "skip") {
    rl.close();
    process.stdout.write("Skipped.\n");
    return;
  }

  const nextStep = await ask("Q3: Where should the next session pick up?", draft.nextStep);
  if (nextStep === "skip") {
    rl.close();
    process.stdout.write("Skipped.\n");
    return;
  }

  rl.close();

  const result = await submitCloseOut({
    cwd: opts.cwd,
    ...(opts.vaultRoot !== undefined && { vaultRoot: opts.vaultRoot }),
    ...(opts.projectId !== undefined && { projectId: opts.projectId }),
    sessionId,
    answers: { didFinish, decisionOrLearning, nextStep },
  });
  process.stdout.write(
    `\nConfirmed: session=${result.sessionPath}` +
      (result.proposalId ? `\nNew proposal: ${result.proposalId}` : "") +
      "\n",
  );
}

async function findLatestSession(root: string): Promise<string | null> {
  const sessionsDir = join(vaultPath(root), "sessions");
  try {
    const entries = await fs.readdir(sessionsDir);
    const ids = entries.filter((e) => e.endsWith(".md")).map((e) => e.replace(/\.md$/, ""));
    if (ids.length === 0) return null;
    ids.sort().reverse(); // sessions are ID-sorted (date-prefixed)
    return ids[0] ?? null;
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
