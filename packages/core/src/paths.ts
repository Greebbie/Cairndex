import { join } from "node:path";

export const VAULT_DIR = ".cairndex";
export const CONFIG_FILE = "config.yaml";
export const INDEX_FILE = "index.md";
export const ARCHIVE_DIR = "archive";

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
