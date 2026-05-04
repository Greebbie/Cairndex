import { useClaudeCodeStatus, useWireClaudeCode } from "@/lib/api";

interface Props {
  alias: string;
}

/**
 * Settings panel that shows whether the agent (Claude Code) is wired into this
 * project's `.claude/settings.json` and lets the user (re-)install the cairndex
 * hooks + MCP server entry with a single click. Replaces the previous flow that
 * forced users into a terminal to run `cairndex init`.
 *
 * "Wired" means at least one cairndex-managed hook OR the `mcpServers.cairndex`
 * entry is present. Server returns the breakdown so we can show what's there
 * specifically (which hook events, MCP yes/no).
 */
export function ClaudeCodeIntegrationPanel({ alias }: Props) {
  const status = useClaudeCodeStatus(alias);
  const wire = useWireClaudeCode();

  if (status.isLoading) {
    return (
      <section className="rounded border border-border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold">Claude Code Integration</h3>
        <p className="text-xs text-muted-foreground">Checking status…</p>
      </section>
    );
  }

  const s = status.data;
  const wired = s?.wired ?? false;
  const expectedHooks = ["PostToolUse", "Stop", "SessionStart"] as const;
  const installedHooks = new Set(s?.hookEvents ?? []);
  const allHooksPresent = expectedHooks.every((h) => installedHooks.has(h));
  const fullyWired = wired && allHooksPresent && (s?.mcpRegistered ?? false);

  return (
    <section className="rounded border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Claude Code Integration</h3>
        <span
          className={
            fullyWired
              ? "text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : wired
                ? "text-xs px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                : "text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
          }
        >
          {fullyWired ? "Wired ✓" : wired ? "Partial" : "Not wired"}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Installs cairndex hooks (PostToolUse / Stop / SessionStart) and the MCP server entry into{" "}
        <code>{s?.settingsPath ?? ".claude/settings.json"}</code>. Equivalent to running{" "}
        <code>cairndex init</code> in a terminal — idempotent; re-running just refreshes the
        cairndex-managed entries and leaves any third-party hooks alone.
      </p>

      <div className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Hooks installed:</span>
        <span>
          {expectedHooks.map((h) => (
            <span
              key={h}
              className={`inline-block mr-2 ${installedHooks.has(h) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground line-through"}`}
            >
              {h}
            </span>
          ))}
        </span>
        <span className="text-muted-foreground">MCP server:</span>
        <span
          className={
            s?.mcpRegistered ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          }
        >
          {s?.mcpRegistered ? "registered (cairndex)" : "not registered"}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => wire.mutate(alias)}
          disabled={wire.isPending}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          {wire.isPending ? "Wiring…" : fullyWired ? "Re-wire / refresh" : "Wire Claude Code"}
        </button>
        {wire.isSuccess && !wire.isPending && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Refreshed</span>
        )}
        {wire.isError && (
          <span className="text-xs text-destructive">Error: {String(wire.error)}</span>
        )}
      </div>
    </section>
  );
}
