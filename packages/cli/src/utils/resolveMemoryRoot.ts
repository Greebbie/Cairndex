import { resolve } from "node:path";
import { projectRefFromVault, resolveProjectRef } from "@cairndex/core";

export interface ResolveMemoryRootOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

export function resolveMemoryRoot(opts: ResolveMemoryRootOptions): string {
  if (opts.vaultRoot && opts.projectId) {
    return projectRefFromVault({
      vaultRoot: opts.vaultRoot,
      projectId: opts.projectId,
      repoRoot: opts.cwd,
    }).projectRoot;
  }

  if (opts.projectId) {
    const ref = resolveProjectRef({ cwd: opts.cwd, legacyFallback: false });
    if (!ref || ref.projectId === "legacy") {
      throw new Error("--project requires --vault or a .cairndex-project.yaml pointer");
    }
    return projectRefFromVault({
      vaultRoot: ref.vaultRoot,
      projectId: opts.projectId,
      repoRoot: opts.cwd,
    }).projectRoot;
  }

  if (opts.vaultRoot) return resolve(opts.vaultRoot);

  const ref = resolveProjectRef({ cwd: opts.cwd });
  if (!ref) return resolve(opts.cwd);
  if (ref.projectId === "legacy") return ref.repoRoot ?? resolve(opts.cwd);
  return ref.projectRoot;
}
