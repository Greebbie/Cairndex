import { existsSync } from "node:fs";
import {
  buildActiveContext,
  buildMemoryHealth,
  defaultConfig,
  findLatestPackWithStaleness,
  inboxProposalsPath,
  listProposals,
  loadProjectConfig,
  projectIdFromRoot,
  renderAgentSurface,
  resolveProjectRef,
  vaultExists,
  vaultPath,
} from "@cairndex/core";
import { missingVaultMessage } from "../utils/missingVaultMessage.js";
import { resolveMemoryRoot } from "../utils/resolveMemoryRoot.js";

function fmtAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

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

  // Absolute paths so the agent — which sees the bootstrap text in its first
  // turn but has no other notion of "where the vault lives" — can reference
  // them in tool calls without guessing relative roots. CLAUDE.md gets only
  // relative-to-vault references, since absolute paths there would create
  // per-machine churn in the checked-in file.
  const ref = resolveProjectRef({
    cwd: opts.cwd,
    ...(opts.vaultRoot && opts.projectId
      ? { vaultRoot: opts.vaultRoot, projectId: opts.projectId }
      : {}),
  });

  const lines: string[] = [];
  lines.push("=== Cairndex session bootstrap ===");
  if (ref) {
    lines.push("");
    lines.push("Paths:");
    // For legacy projects vaultRoot === projectRoot, so skip the redundant line.
    if (ref.vaultRoot !== ref.projectRoot) {
      lines.push(`  Vault root:   ${ref.vaultRoot}`);
    }
    lines.push(`  Project root: ${ref.projectRoot}`);
    if (ref.repoRoot) lines.push(`  Repo root:    ${ref.repoRoot}`);
    lines.push(`  Inbox:        ${inboxProposalsPath(root)}`);
    lines.push("");
  }
  lines.push(renderAgentSurface(ctx, health, projectId));
  // When something's red or yellow, show up to three issue summaries inline so
  // the agent doesn't have to shell out to `cairndex doctor` to learn what's
  // wrong. Red issues are listed before yellow — they're the ones an agent
  // should resolve before doing more work on top of the existing memory.
  if (health.counts.red + health.counts.yellow > 0 && health.issues.length > 0) {
    const sorted = [...health.issues].sort((a, b) => {
      const rank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
      return rank(a.severity) - rank(b.severity);
    });
    lines.push("Top issues:");
    for (const i of sorted.slice(0, 3)) {
      lines.push(`  ${i.severity.padEnd(6)} ${i.nodeId}: ${i.message}`);
    }
    if (sorted.length > 3) {
      lines.push(`  …and ${sorted.length - 3} more — run \`cairndex doctor\` for the full list.`);
    }
  }
  lines.push("");

  // Latest context pack + staleness — surface in bootstrap so the agent's first
  // turn knows whether the cached pack reflects current memory. Without this,
  // the agent would happily trust a pack built before the most recent decision.
  const latestPack = await findLatestPackWithStaleness(root);
  if (latestPack) {
    const builtAge = fmtAge(latestPack.builtAt) ?? latestPack.builtAt;
    if (latestPack.stale) {
      const memAge = fmtAge(latestPack.lastMemoryChangeAt) ?? "recently";
      lines.push(
        `Latest context pack: ${latestPack.id} (built ${builtAge}, STALE — memory changed ${memAge})`,
      );
      lines.push(`  Rebuild before relying on it: cairndex context "<task>"`);
    } else {
      lines.push(`Latest context pack: ${latestPack.id} (built ${builtAge}, current)`);
    }
    lines.push("");
  }

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
  lines.push("Reminder: propose durable memory changes via the inbox — never edit canonical files directly.");
  lines.push("  new memory:    cairndex inbox propose --type insight --target <id>");
  lines.push("  update memory: cairndex inbox propose-update <targetId>");
  lines.push("Workflow state can be advanced directly (no inbox round-trip):");
  lines.push("  switch task:   cairndex task switch <TASK-id>");
  lines.push("  complete task: cairndex task complete [<TASK-id>]");
  lines.push("  set phase:     cairndex phase set <name>");

  return { exitCode: 0, body: lines.join("\n") };
}
