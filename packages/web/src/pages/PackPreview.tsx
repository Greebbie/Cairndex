import { ContextPackList } from "@/components/cockpit/ContextPackList";
import { TokenBar } from "@/components/cockpit/TokenBar";
import { useComposePack, usePack, usePacks } from "@/lib/api";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

export default function PackPreview() {
  const { alias, packId } = useParams<{ alias: string; packId?: string }>();
  const navigate = useNavigate();
  const pack = usePack(alias, packId);
  const recent = usePacks(alias);
  const compose = useComposePack();
  const [task, setTask] = useState("");

  if (!alias) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold mb-2">No project selected</h2>
      </div>
    );
  }

  async function handleCompose(e: React.FormEvent) {
    e.preventDefault();
    if (!alias) return;
    const result = await compose.mutateAsync({ alias, task: task.trim() || "untitled" });
    navigate(`/p/${alias}/pack/${result.packId}`);
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Context Pack</h2>
        <Link to={`/p/${alias}`} className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>
      </div>

      <section className="rounded border bg-card text-card-foreground p-4 space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Compose
        </h3>
        <form onSubmit={handleCompose} className="flex gap-2">
          <input
            type="text"
            placeholder="Task label (e.g. fix web e2e)"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="flex-1 rounded border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={compose.isPending}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
          >
            {compose.isPending ? "Building…" : "Build"}
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          Use a task ID or short focus phrase. Direct IDs and strong title matches pull in the
          matching task plus linked plans, specs, decisions, insights, and open questions. Agent can{" "}
          <code className="font-mono">grep</code> the project memory directly for anything more.
        </p>
        {compose.isError ? (
          <div className="text-xs text-red-600">
            Build failed: {(compose.error as Error)?.message ?? "unknown error"}
          </div>
        ) : null}
      </section>

      {packId ? (
        <section className="rounded border bg-card text-card-foreground p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Preview
            </h3>
            {pack.data ? (
              <button
                type="button"
                onClick={() => {
                  if (pack.data) void navigator.clipboard.writeText(pack.data.raw);
                }}
                className="text-xs text-primary hover:underline"
              >
                Copy markdown
              </button>
            ) : null}
          </div>

          {pack.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading pack…</div>
          ) : pack.isError ? (
            <div className="text-sm text-red-600">Pack not found.</div>
          ) : pack.data ? (
            <>
              <div className="text-sm">
                <div>
                  Pack:{" "}
                  <span className="font-mono text-xs">
                    {pack.data.frontmatter.id ?? pack.data.packId}
                  </span>
                </div>
                {pack.data.frontmatter.task ? (
                  <div className="text-xs text-muted-foreground">
                    Task: <span className="font-mono">{pack.data.frontmatter.task}</span>
                  </div>
                ) : null}
              </div>
              <TokenBar
                used={pack.data.frontmatter.tokenEstimate ?? 0}
                budget={pack.data.frontmatter.tokenBudget ?? 8000}
                trimmed={pack.data.frontmatter.trimmedItems ?? 0}
              />
              {pack.data.frontmatter.warnings && pack.data.frontmatter.warnings.length > 0 ? (
                <div className="rounded p-2 text-xs bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 space-y-1">
                  {pack.data.frontmatter.warnings.map((w) => (
                    <div key={w}>⚠ {w}</div>
                  ))}
                </div>
              ) : null}
              <div>
                <div className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">
                  Claude will read:
                </div>
                <ContextPackList alias={alias} pack={pack.data} />
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recent packs
        </h3>
        {recent.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !recent.data || recent.data.packs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No packs yet.</div>
        ) : (
          <ul className="divide-y text-sm">
            {recent.data.packs.slice(0, 8).map((p) => (
              <li key={p.packId} className="py-1.5 flex gap-3 items-center">
                <Link
                  to={`/p/${alias}/pack/${p.packId}`}
                  className="font-mono text-primary hover:underline"
                >
                  {p.packId}
                </Link>
                <span className="text-xs text-muted-foreground flex-1 truncate">{p.task}</span>
                <span className="text-xs text-muted-foreground">{p.tokenEstimate} tk</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
