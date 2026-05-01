import type { ProjectEntry } from "@cairndex/core";

export function resolveProject(
  projects: readonly ProjectEntry[],
  alias: string,
): ProjectEntry | null {
  return projects.find((p) => p.alias === alias) ?? null;
}
