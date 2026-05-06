import { useClaudeCodeStatus, useCodexStatus, useWireClaudeCode, useWireCodex } from "@/lib/api";
import type { ClaudeCodeStatus, CodexStatus } from "@/lib/types";
import type { ReactNode } from "react";

interface Props {
  alias: string;
}

const EXPECTED_EVENTS = ["PostToolUse", "SessionStart", "Stop"] as const;

function hasEvents(events: readonly string[]): boolean {
  return EXPECTED_EVENTS.every((event) => events.includes(event));
}

function codexReady(status: CodexStatus | undefined): boolean {
  return !!status && hasEvents(status.hookEvents) && status.agentsBlockPresent;
}

function claudeReady(status: ClaudeCodeStatus | undefined): boolean {
  return !!status && hasEvents(status.hookEvents) && status.mcpRegistered;
}

function StatusBadge({ ready, partial }: { ready: boolean; partial: boolean }) {
  const label = ready ? "Connected" : partial ? "Partial" : "Not connected";
  const cls = ready
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : partial
      ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
      : "bg-muted text-muted-foreground";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

function Capability({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
      {children}
    </span>
  );
}

export function AgentIntegrationPanel({ alias }: Props) {
  const codex = useCodexStatus(alias);
  const claude = useClaudeCodeStatus(alias);
  const wireCodex = useWireCodex();
  const wireClaude = useWireClaudeCode();

  const codexStatus = codex.data;
  const claudeStatus = claude.data;
  const codexFullyReady = codexReady(codexStatus);
  const claudeFullyReady = claudeReady(claudeStatus);
  const codexPartial = !!codexStatus?.wired && !codexFullyReady;
  const claudePartial = !!claudeStatus?.wired && !claudeFullyReady;

  return (
    <section className="rounded border bg-card text-card-foreground p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase">Agent Integration</h3>
        <p className="text-xs text-muted-foreground">
          Connect an agent so every new session starts with the current handoff and every finished
          session feeds the resume.
        </p>
      </div>

      <div className="divide-y divide-border text-sm">
        <div className="pb-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">Codex</div>
            <StatusBadge ready={codexFullyReady} partial={codexPartial} />
          </div>
          <div className="grid gap-1 text-xs">
            <Capability ok={hasEvents(codexStatus?.hookEvents ?? [])}>
              hooks: session + edit
            </Capability>
            <Capability ok={codexStatus?.agentsBlockPresent ?? false}>
              AGENTS.md handoff block
            </Capability>
          </div>
          <button
            type="button"
            onClick={() => wireCodex.mutate(alias)}
            disabled={wireCodex.isPending}
            className="rounded bg-primary text-primary-foreground px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {wireCodex.isPending
              ? "Connecting..."
              : codexFullyReady
                ? "Refresh Codex"
                : "Connect Codex"}
          </button>
          {wireCodex.isError ? (
            <div className="text-xs text-destructive">Error: {String(wireCodex.error)}</div>
          ) : null}
        </div>

        <div className="pt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">Claude Code</div>
            <StatusBadge ready={claudeFullyReady} partial={claudePartial} />
          </div>
          <div className="grid gap-1 text-xs">
            <Capability ok={hasEvents(claudeStatus?.hookEvents ?? [])}>
              hooks: session + edit
            </Capability>
            <Capability ok={claudeStatus?.mcpRegistered ?? false}>MCP server</Capability>
          </div>
          <button
            type="button"
            onClick={() => wireClaude.mutate(alias)}
            disabled={wireClaude.isPending}
            className="rounded border px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {wireClaude.isPending
              ? "Connecting..."
              : claudeFullyReady
                ? "Refresh Claude Code"
                : "Connect Claude Code"}
          </button>
          {wireClaude.isError ? (
            <div className="text-xs text-destructive">Error: {String(wireClaude.error)}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
