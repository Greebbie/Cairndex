import { useProjects } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";

function aliasFromPath(pathname: string): string | undefined {
  // pathname is "/p/<alias>[/...]" — Sidebar is rendered outside <Routes>, so
  // useParams() does not see :alias. Parse it ourselves.
  const m = /^\/p\/([^/]+)/.exec(pathname);
  return m?.[1];
}

export function Sidebar() {
  const projects = useProjects();
  const location = useLocation();
  const current = aliasFromPath(location.pathname);

  // Order matches the vibe-coding hot path: Dashboard for the at-a-glance state,
  // then the two surfaces a user reaches for during a turn (Inbox for review,
  // Context Pack for what the agent will see). Browse/Timeline/Settings sit
  // below as reference / config, used less often.
  const navItems = current
    ? [
        { to: `/p/${current}`, label: "Dashboard" },
        { to: `/p/${current}/inbox`, label: "Inbox" },
        { to: `/p/${current}/pack`, label: "Context Pack" },
        { to: `/p/${current}/implementation`, label: "Implementation" },
        { to: `/p/${current}/browse`, label: "Browse" },
        { to: `/p/${current}/timeline`, label: "Timeline" },
        { to: `/p/${current}/settings`, label: "Settings" },
      ]
    : [];

  return (
    <aside className="w-full shrink-0 border-b border-border bg-muted/30 p-3 md:w-64 md:border-b-0 md:border-r md:p-4">
      <h1 className="text-lg font-semibold">cairndex</h1>

      <div className="mt-3 space-y-3 md:mt-4 md:space-y-4">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Projects
          </div>
          <ul className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
            {(projects.data ?? []).map((p) => {
              // Tooltip shows where the project's data lives. For central-vault
              // projects, the durable memory is in `<vaultRoot>/projects/<id>`,
              // not in the repo. Show both so the user can reason about file
              // locations without opening Settings.
              const tooltip = p.vaultRoot
                ? `Repo: ${p.path}\nVault: ${p.vaultRoot}\nProject: ${p.projectId ?? p.alias}`
                : p.path;
              return (
                <li key={p.alias}>
                  <Link
                    to={`/p/${p.alias}`}
                    className={cn(
                      "block whitespace-nowrap px-2 py-1 rounded text-sm hover:bg-accent",
                      current === p.alias && "bg-accent font-medium",
                    )}
                    title={tooltip}
                  >
                    {p.alias}
                  </Link>
                </li>
              );
            })}
            {projects.isLoading && <li className="text-xs text-muted-foreground">Loading...</li>}
            {projects.error && <li className="text-xs text-destructive">Error loading projects</li>}
          </ul>
        </div>

        {navItems.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              View
            </div>
            <ul className="flex gap-1 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
              {navItems.map((n) => (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    className={cn(
                      "block whitespace-nowrap px-2 py-1 rounded text-sm hover:bg-accent",
                      location.pathname === n.to && "bg-accent font-medium",
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
