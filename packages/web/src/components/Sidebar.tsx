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

  const navItems = current
    ? [
        { to: `/p/${current}`, label: "Dashboard" },
        { to: `/p/${current}/browse`, label: "Browse" },
        { to: `/p/${current}/timeline`, label: "Timeline" },
        { to: `/p/${current}/settings`, label: "Settings" },
      ]
    : [];

  return (
    <aside className="w-64 border-r border-border bg-muted/30 p-4 flex flex-col gap-4">
      <h1 className="text-lg font-semibold">cairndex</h1>

      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Projects
        </div>
        <ul className="space-y-1">
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
                    "block px-2 py-1 rounded text-sm hover:bg-accent",
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
          <ul className="space-y-1">
            {navItems.map((n) => (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className={cn(
                    "block px-2 py-1 rounded text-sm hover:bg-accent",
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
    </aside>
  );
}
