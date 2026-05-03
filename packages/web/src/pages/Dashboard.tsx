import { ActivePlanPanel } from "@/components/cockpit/ActivePlanPanel";
import { AgentContextPanel } from "@/components/cockpit/AgentContextPanel";
import { InboxPanel } from "@/components/cockpit/InboxPanel";
import { MemoryHealthPanel } from "@/components/cockpit/MemoryHealthPanel";
import { ProjectStatePanel } from "@/components/cockpit/ProjectStatePanel";
import { DoctorBadge } from "@/components/DoctorBadge";
import { LastTurnCard } from "@/components/LastTurnCard";
import { NowBar } from "@/components/NowBar";
import { useDashboard, useProjects } from "@/lib/api";
import { useWatcherEvents } from "@/lib/sse";
import { humanizeDateString } from "@/lib/time";
import { useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

export default function Dashboard() {
  const { alias } = useParams<{ alias: string }>();
  const navigate = useNavigate();
  const projects = useProjects();
  const dashboard = useDashboard(alias);
  useWatcherEvents(alias);

  useEffect(() => {
    if (!alias && projects.data && projects.data.length > 0) {
      navigate(`/p/${projects.data[0]?.alias}`, { replace: true });
    }
  }, [alias, projects.data, navigate]);

  if (!alias) {
    if (projects.isLoading) {
      return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
    }
    if (projects.data && projects.data.length === 0) {
      return <Navigate to="/onboard" replace />;
    }
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold mb-2">Pick a project</h2>
        <p className="text-muted-foreground text-sm">
          Choose a project from the sidebar, or{" "}
          <Link to="/onboard" className="text-primary hover:underline">
            register a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  const data = dashboard.data;

  return (
    <div className="p-8 space-y-4 max-w-3xl">
      {data ? <NowBar alias={alias} state={data.projectState} /> : null}
      <LastTurnCard alias={alias} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{alias}</h2>
          {(() => {
            const proj = projects.data?.find((p) => p.alias === alias);
            if (!proj) return null;
            // Surface where this project's durable memory actually lives. For
            // central-vault projects the vault path is the answer; for legacy
            // repo-local layouts it's the repo path itself.
            const dataPath = proj.projectRoot ?? proj.path;
            return (
              <div
                className="text-xs text-muted-foreground font-mono mt-0.5"
                title={proj.vaultRoot ? `Vault: ${proj.vaultRoot}` : `Legacy layout — memory in <repo>/${".cairndex"}/`}
              >
                {dataPath}
              </div>
            );
          })()}
        </div>
        <DoctorBadge alias={alias} />
      </div>

      {dashboard.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading cockpit…</div>
      ) : dashboard.isError ? (
        <div className="text-sm text-red-600">
          Failed to load dashboard. Run <code>cairndex doctor</code> to diagnose.
        </div>
      ) : data ? (
        <>
          <ProjectStatePanel alias={alias} state={data.projectState} />
          <ActivePlanPanel alias={alias} state={data.projectState} />
          <AgentContextPanel alias={alias} agentContext={data.agentContext} />
          <MemoryHealthPanel alias={alias} health={data.memoryHealth} />
          <InboxPanel alias={alias} />

          <section className="rounded border bg-card text-card-foreground p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recent Activity
              </h3>
              <Link to={`/p/${alias}/timeline`} className="text-xs text-primary hover:underline">
                Full timeline →
              </Link>
            </div>
            {data.recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <ul className="text-sm divide-y">
                {data.recentActivity.slice(0, 6).map((e, idx) => (
                  <li key={`${e.date}-${idx}`} className="py-1.5 flex gap-3">
                    <span
                      className="font-mono text-xs text-muted-foreground w-24 shrink-0"
                      title={e.date}
                    >
                      {humanizeDateString(e.date)}
                    </span>
                    <span className="flex-1">{e.summary}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
