import { join } from "node:path";

export const VAULT_DIR = ".cairndex";
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

export function vaultPath(repoRoot: string): string {
  return join(repoRoot, VAULT_DIR);
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
