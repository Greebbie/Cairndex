import { DoctorBadge } from "@/components/DoctorBadge";
import { PhaseTracker } from "@/components/PhaseTracker";
import { useProjects, useVaultOverview } from "@/lib/api";
import { useWatcherEvents } from "@/lib/sse";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function Dashboard() {
  const { alias } = useParams<{ alias: string }>();
  const navigate = useNavigate();
  const projects = useProjects();
  const overview = useVaultOverview(alias);
  useWatcherEvents(alias);

  // If no alias selected and projects exist, redirect to first project
  useEffect(() => {
    if (!alias && projects.data && projects.data.length > 0) {
      navigate(`/p/${projects.data[0]?.alias}`, { replace: true });
    }
  }, [alias, projects.data, navigate]);

  if (!alias) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold mb-2">No project selected</h2>
        <p className="text-muted-foreground">
          Register a project with <code>cairndex init</code>, then it will appear in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{alias}</h2>
        <DoctorBadge alias={alias} />
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2">Phase</div>
        <PhaseTracker phase={overview.data?.phase ?? null} />
      </div>

      {overview.data?.nextAction && (
        <div className="bg-muted/50 rounded p-3">
          <div className="text-xs uppercase text-muted-foreground">Next action</div>
          <div className="text-sm">{overview.data.nextAction}</div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2">Counts</div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {Object.entries(overview.data?.counts ?? {}).map(([type, n]) => (
            <li key={type} className="bg-muted/30 rounded p-2 text-sm">
              <div className="text-xs text-muted-foreground">{type}</div>
              <div className="text-lg font-semibold">{n}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
