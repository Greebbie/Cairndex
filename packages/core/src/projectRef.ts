import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import {
  centralProjectPath,
  projectManifestPath,
  repoPointerPath,
  REPO_POINTER_FILE,
  VAULT_DIR,
  vaultPath,
} from "./paths.js";

function globalRegistryDir(): string {
  return process.env.CAIRNDEX_HOME ?? join(homedir(), ".cairndex");
}

export interface ProjectRef {
  vaultRoot: string;
  projectId: string;
  projectRoot: string;
  repoRoot?: string;
}

export const ProjectPointerSchema = z.object({
  vault: z.string().min(1),
  project: z.string().min(1),
});

export type ProjectPointer = z.infer<typeof ProjectPointerSchema>;

export const ProjectManifestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    repo_paths: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
    status: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
  })
  .passthrough();

export type ProjectManifest = z.infer<typeof ProjectManifestSchema>;

export interface ResolveProjectRefInput {
  cwd?: string;
  vaultRoot?: string;
  projectId?: string;
  repoRoot?: string;
  legacyFallback?: boolean;
}

function resolvePath(baseDir: string, input: string): string {
  return isAbsolute(input) ? resolve(input) : resolve(baseDir, input);
}

function findUp(startDir: string, marker: string): string | null {
  let cur = resolve(startDir);
  while (true) {
    if (existsSync(resolve(cur, marker))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

function parseYamlFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw, { schema: yaml.JSON_SCHEMA });
}

export function projectRefFromVault(input: {
  vaultRoot: string;
  projectId: string;
  repoRoot?: string;
}): ProjectRef {
  const vaultRoot = resolve(input.vaultRoot);
  const projectId = input.projectId;
  const projectRoot = centralProjectPath(vaultRoot, projectId);
  const repoRoot = input.repoRoot ? resolve(input.repoRoot) : undefined;
  return repoRoot
    ? { vaultRoot, projectId, projectRoot, repoRoot }
    : { vaultRoot, projectId, projectRoot };
}

export function legacyProjectRef(repoRoot: string, projectId?: string): ProjectRef {
  const resolvedRepoRoot = resolve(repoRoot);
  const projectRoot = vaultPath(resolvedRepoRoot);
  return {
    vaultRoot: projectRoot,
    projectId: projectId ?? "legacy",
    projectRoot,
    repoRoot: resolvedRepoRoot,
  };
}

export function readProjectPointer(repoRoot: string): ProjectPointer | null {
  const path = repoPointerPath(repoRoot);
  if (!existsSync(path)) return null;
  return ProjectPointerSchema.parse(parseYamlFile(path));
}

export function projectRefFromPointer(repoRoot: string): ProjectRef | null {
  const resolvedRepoRoot = resolve(repoRoot);
  const pointer = readProjectPointer(resolvedRepoRoot);
  if (!pointer) return null;
  return projectRefFromVault({
    vaultRoot: resolvePath(resolvedRepoRoot, pointer.vault),
    projectId: pointer.project,
    repoRoot: resolvedRepoRoot,
  });
}

export function findProjectPointerRoot(startDir: string): string | null {
  return findUp(startDir, REPO_POINTER_FILE);
}

export function findLegacyVaultRepoRoot(startDir: string): string | null {
  // The global alias-registry lives at ~/.cairndex/ (or $CAIRNDEX_HOME). It is NOT
  // a project vault — treating it as one means any cwd outside a real repo would
  // resolve to the global dir and corrupt downstream operations. Skip it.
  const globalDir = resolve(globalRegistryDir());
  let cur = resolve(startDir);
  while (true) {
    const candidate = resolve(cur, VAULT_DIR);
    if (existsSync(candidate) && candidate !== globalDir) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function resolveProjectRef(input: ResolveProjectRefInput = {}): ProjectRef | null {
  if ((input.vaultRoot && !input.projectId) || (!input.vaultRoot && input.projectId)) {
    throw new Error(
      "resolveProjectRef requires both vaultRoot and projectId when either is provided",
    );
  }

  const cwd = resolve(input.cwd ?? process.cwd());
  const repoSearchRoot = resolve(input.repoRoot ?? cwd);

  if (input.vaultRoot && input.projectId) {
    const refInput: { vaultRoot: string; projectId: string; repoRoot?: string } = {
      vaultRoot: input.vaultRoot,
      projectId: input.projectId,
    };
    if (input.repoRoot) refInput.repoRoot = input.repoRoot;
    return projectRefFromVault(refInput);
  }

  const pointerRoot = findProjectPointerRoot(repoSearchRoot);
  if (pointerRoot) return projectRefFromPointer(pointerRoot);

  if (input.legacyFallback !== false) {
    const legacyRoot = findLegacyVaultRepoRoot(repoSearchRoot);
    if (legacyRoot) return legacyProjectRef(legacyRoot);
  }

  return null;
}

export function readProjectManifest(projectRoot: string): ProjectManifest | null {
  const path = projectManifestPath(projectRoot);
  if (!existsSync(path)) return null;
  return ProjectManifestSchema.parse(parseYamlFile(path));
}
