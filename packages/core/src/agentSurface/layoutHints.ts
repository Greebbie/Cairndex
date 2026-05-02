import { basename } from "node:path";
import { isCentralProjectRoot } from "../paths.js";

export const LEGACY_PROJECT_ID = "legacy";

export function projectIdFromRoot(rootPath: string): string {
  if (isCentralProjectRoot(rootPath)) return basename(rootPath);
  return LEGACY_PROJECT_ID;
}

function isLegacy(projectId: string): boolean {
  return projectId === LEGACY_PROJECT_ID;
}

export function inboxProposalsHint(projectId: string): string {
  return isLegacy(projectId)
    ? ".cairndex/inbox/proposed-memory-updates/"
    : `projects/${projectId}/inbox/proposed-memory-updates/`;
}

export function archiveDestinationHint(projectId: string): string {
  return isLegacy(projectId)
    ? ".cairndex/archive/<type>/"
    : `projects/${projectId}/archive/<type>/`;
}

export function searchVaultHint(projectId: string): string {
  return isLegacy(projectId) ? "grep .cairndex/" : `grep projects/${projectId}/`;
}
