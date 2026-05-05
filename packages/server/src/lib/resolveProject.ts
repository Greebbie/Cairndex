import type { ProjectEntry } from "@cairndex/core";

/**
 * Aliases come from URL params (`/api/vault/:alias/...`), so even though the actual
 * filesystem path is taken from the registry entry (not from the alias), keeping the
 * shape constrained avoids a class of misuse: stray `..`, slashes, query fragments,
 * or accidentally-encoded `undefined`/empty strings short-circuit before they hit
 * the registry scan. The alphabet here mirrors what `cairndex project register`
 * accepts — letters, digits, hyphen, underscore, dot — capped at 64 chars to keep
 * URLs sane and to bound any future inclusion in filenames.
 */
const ALIAS_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function resolveProject(
  projects: readonly ProjectEntry[],
  alias: string,
): ProjectEntry | null {
  if (typeof alias !== "string" || !ALIAS_PATTERN.test(alias)) return null;
  return (
    projects.find(
      (p) => p.alias === alias || p.projectId === alias || (p.aliases ?? []).includes(alias),
    ) ?? null
  );
}
