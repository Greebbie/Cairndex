import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";

export const VAULT_DIR = ".cairndex";
export const REPO_POINTER_FILE = ".cairndex-project.yaml";
export const CENTRAL_VAULT_FILE = "vault.yaml";
export const PROJECTS_DIR = "projects";
export const PROJECT_MANIFEST_FILE = "project.yaml";
export const SHARED_DIR = "shared";
export const CONFIG_FILE = "config.yaml";
export const INDEX_FILE = "index.md";
export const ARCHIVE_DIR = "archive";
export const INDEXES_DIR = "indexes";
export const INBOX_DIR = "inbox";
export const INBOX_PROPOSALS_DIR = "proposed-memory-updates";
export const ACTIVE_CONTEXT_FILE = "active-context.json";
export const NODE_SUMMARY_FILE = "node-summary.json";
export const BACKLINKS_FILE = "backlinks.json";
export const MEMORY_HEALTH_FILE = "memory-health.json";
export const CONTEXT_PACKS_DIR = "context-packs";

export function isCentralProjectRoot(root: string): boolean {
  if (existsSync(join(root, PROJECT_MANIFEST_FILE))) return true;
  return (
    basename(dirname(root)) === PROJECTS_DIR &&
    existsSync(join(dirname(dirname(root)), CENTRAL_VAULT_FILE))
  );
}

export function centralVaultRootForProject(projectRoot: string): string | null {
  if (!isCentralProjectRoot(projectRoot)) return null;
  return dirname(dirname(projectRoot));
}

/**
 * Read a `.cairndex-project.yaml` pointer file from disk. Inlined here (rather than
 * imported from `projectRef.ts`) because that module imports from this one — a
 * circular dependency would result. The format is intentionally tiny so a local
 * parser is appropriate; full validation lives in `projectRef.ts::ProjectPointerSchema`.
 */
function readPointerVaultAndProject(repoRoot: string): { vault: string; project: string } | null {
  const pointerPath = join(repoRoot, REPO_POINTER_FILE);
  if (!existsSync(pointerPath)) return null;
  try {
    const raw = readFileSync(pointerPath, "utf8");
    const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as
      | { vault?: unknown; project?: unknown }
      | null
      | undefined;
    if (
      parsed &&
      typeof parsed.vault === "string" &&
      typeof parsed.project === "string" &&
      parsed.vault.length > 0 &&
      parsed.project.length > 0
    ) {
      return { vault: parsed.vault, project: parsed.project };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the directory holding a project's durable memory (specs, decisions, plans,
 * sessions, inbox/, indexes/, …). Three cases, in priority order:
 *
 *   1. The input is already a central project root (has a `project.yaml` or sits inside
 *      a `<vault>/projects/` parent) → return it as-is.
 *   2. The input is a repo with a `.cairndex-project.yaml` pointer → follow the pointer
 *      and return `<vaultRoot>/projects/<projectId>`. This is the case server routes
 *      relied on accidentally working before the fix; without this branch they read the
 *      orphan legacy `.cairndex/` instead of the actual central vault.
 *   3. The input is a legacy repo with no pointer → return `<repoRoot>/.cairndex/`.
 *
 * This is the single source of truth for "where does memory live for this thing." All
 * derived path helpers (`inboxPath`, `configPath`, `nodeFolderPath`, …) build on it,
 * so consumers that pass a repo root automatically get the right layout.
 */
export function vaultPath(repoRoot: string): string {
  if (isCentralProjectRoot(repoRoot)) return repoRoot;
  const pointer = readPointerVaultAndProject(repoRoot);
  if (pointer) {
    const vaultRoot = isAbsolute(pointer.vault)
      ? resolve(pointer.vault)
      : resolve(repoRoot, pointer.vault);
    return centralProjectPath(vaultRoot, pointer.project);
  }
  return join(repoRoot, VAULT_DIR);
}

export function repoPointerPath(repoRoot: string): string {
  return join(repoRoot, REPO_POINTER_FILE);
}

export function centralVaultManifestPath(vaultRoot: string): string {
  return join(vaultRoot, CENTRAL_VAULT_FILE);
}

export function centralProjectsPath(vaultRoot: string): string {
  return join(vaultRoot, PROJECTS_DIR);
}

export function centralProjectPath(vaultRoot: string, projectId: string): string {
  return join(centralProjectsPath(vaultRoot), projectId);
}

export function projectManifestPath(projectRoot: string): string {
  return join(projectRoot, PROJECT_MANIFEST_FILE);
}

export function centralSharedPath(vaultRoot: string): string {
  return join(vaultRoot, SHARED_DIR);
}

/**
 * Where editable operating-rule markdown lives for the agent surface.
 * For central projects: vault-shared (`<vaultRoot>/shared/rules/`) — affects every project in the vault.
 * For legacy repo-local projects: `<repo>/.cairndex/rules/`.
 */
export function rulesDirForProject(projectRoot: string): string {
  const vaultRoot = centralVaultRootForProject(projectRoot);
  if (vaultRoot) {
    return join(centralSharedPath(vaultRoot), "rules");
  }
  return join(vaultPath(projectRoot), "rules");
}

export function configPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), CONFIG_FILE);
}

export function indexPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), INDEX_FILE);
}

export function nodeFolderPath(repoRoot: string, folderName: string): string {
  return join(vaultPath(repoRoot), folderName);
}

export function archivePath(repoRoot: string): string {
  return join(vaultPath(repoRoot), ARCHIVE_DIR);
}

export function indexesPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), INDEXES_DIR);
}

export function activeContextPath(repoRoot: string): string {
  return join(indexesPath(repoRoot), ACTIVE_CONTEXT_FILE);
}

export function nodeSummaryPath(repoRoot: string): string {
  return join(indexesPath(repoRoot), NODE_SUMMARY_FILE);
}

export function backlinksPath(repoRoot: string): string {
  return join(indexesPath(repoRoot), BACKLINKS_FILE);
}

export function memoryHealthPath(repoRoot: string): string {
  return join(indexesPath(repoRoot), MEMORY_HEALTH_FILE);
}

export function contextPacksPath(repoRoot: string): string {
  return join(indexesPath(repoRoot), CONTEXT_PACKS_DIR);
}

export function inboxPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), INBOX_DIR);
}

export function inboxProposalsPath(repoRoot: string): string {
  return join(inboxPath(repoRoot), INBOX_PROPOSALS_DIR);
}
