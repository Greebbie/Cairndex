import { existsSync } from "node:fs";
import {
  buildActiveContext,
  buildMemoryHealth,
  defaultConfig,
  listProposals,
  loadProjectConfig,
  projectIdFromRoot,
  renderAgentSurface,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

export interface BootstrapOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
  /** Cap on pending proposals to surface; defaults to 5. */
  proposalLimit?: number;
}

export interface BootstrapResult {
  exitCode: 0 | 1;
  message?: string;
  body?: string;
}

const DEFAULT_PROPOSAL_LIMIT = 5;

/**
 * Renders the Cairndex SessionStart bootstrap block. Invoked from Claude Code's
 * SessionStart hook so the agent's first turn already has phase / active task /
 * pending proposals injected — no need for the agent to discover and read CLAUDE.md
 * before useful work can begin.
 *
 * Output format intentionally mirrors `renderAgentSurface` (used in CLAUDE.md region)
 * so the agent sees the same shape whether it loads context via the file or the hook.
 */
export async function runBootstrap(opts: BootstrapOptions): Promise<BootstrapResult> {
  const root = resolveMemoryRoot(opts);
  if (!vaultExists(root)) {
    return { exitCode: 1, message: missingVaultMessage(root) };
  }
  const cfg = existsSync(`${vaultPath(root)}/config.yaml`)
    ? loadProjectConfig(root)
    : defaultConfig();

  const ctx = await buildActiveContext(root, cfg);
  const health = await buildMemoryHealth(root, cfg);
  const projectId = opts.projectId ?? projectIdFromRoot(root);
  const limit = opts.proposalLimit ?? DEFAULT_PROPOSAL_LIMIT;
  const inbox = await listProposals(root, cfg);

  const lines: string[] = [];
  lines.push("=== Cairndex session bootstrap ===");
  lines.push(renderAgentSurface(ctx, health, projectId));
  lines.push("");
  if (inbox.pending.length === 0) {
    lines.push("Inbox: no pending proposals.");
  } else {
    lines.push(`Pending proposals (${inbox.pending.length} total, showing top ${Math.min(limit, inbox.pending.length)}):`);
    for (const p of inbox.pending.slice(0, limit)) {
      const target = p.target ?? "(new)";
      lines.push(`  - ${p.proposalId}  ${p.proposalType}  ${p.targetType}/${target}  — ${p.summary}`);
    }
  }
  lines.push("");
  lines.push("Reminder: propose durable memory changes via the inbox; never edit canonical files directly.");

  return { exitCode: 0, body: lines.join("\n") };
}
