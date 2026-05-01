import type { ProjectEntry } from "@cairndex/core";

export function resolveProject(
  projects: readonly ProjectEntry[],
  alias: string,
): ProjectEntry | null {
  return (
    projects.find(
      (p) => p.alias === alias || p.projectId === alias || (p.aliases ?? []).includes(alias),
    ) ?? null
  );
}
