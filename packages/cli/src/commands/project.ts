import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  centralProjectPath,
  centralVaultExists,
  projectManifestPath,
  readProjectManifest,
  repoPointerPath,
  vaultPath,
} from "@cairndex/core";
import yaml from "js-yaml";
import { scaffoldMemoryRoot } from "../utils/scaffoldMemory.js";

export interface ProjectRegisterOptions {
  vaultRoot: string;
  projectId: string;
  repoRoot?: string;
  title?: string;
  alias?: string;
}

export interface ProjectImportOptions extends ProjectRegisterOptions {
  overwrite?: boolean;
}

export interface ProjectCommandResult {
  exitCode: 0 | 1;
  projectRoot?: string;
  message?: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeList(values: readonly (string | undefined)[]): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => v?.trim())
        .filter((v): v is string => Boolean(v)),
    ),
  );
}

async function writePointer(repoRoot: string, vaultRoot: string, projectId: string): Promise<void> {
  await writeFile(
    repoPointerPath(repoRoot),
    yaml.dump({
      vault: vaultRoot,
      project: projectId,
    }),
    "utf8",
  );
}

async function writeProjectManifest(opts: ProjectRegisterOptions): Promise<string> {
  const vaultRoot = resolve(opts.vaultRoot);
  const projectRoot = centralProjectPath(vaultRoot, opts.projectId);
  const existing = readProjectManifest(projectRoot);
  const repoPaths = normalizeList([
    ...(existing?.repo_paths ?? []),
    opts.repoRoot ? resolve(opts.repoRoot) : undefined,
  ]);
  const aliases = normalizeList([
    ...(existing?.aliases ?? []),
    opts.alias,
    existing?.aliases.length ? undefined : opts.projectId,
  ]);

  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    projectManifestPath(projectRoot),
    yaml.dump({
      ...(existing ?? {}),
      id: opts.projectId,
      title: opts.title ?? existing?.title ?? opts.projectId,
      repo_paths: repoPaths,
      aliases,
      status: existing?.status ?? "active",
      created: existing?.created ?? todayUtc(),
      updated: todayUtc(),
    }),
    "utf8",
  );
  return projectRoot;
}

export async function runProjectRegister(
  opts: ProjectRegisterOptions,
): Promise<ProjectCommandResult> {
  const vaultRoot = resolve(opts.vaultRoot);
  if (!centralVaultExists(vaultRoot)) {
    return {
      exitCode: 1,
      message: `no central vault found at ${vaultRoot} (run \`cairndex vault init ${vaultRoot}\` first)`,
    };
  }
  if (opts.repoRoot && !existsSync(resolve(opts.repoRoot))) {
    return { exitCode: 1, message: `repo path does not exist: ${resolve(opts.repoRoot)}` };
  }

  const projectRoot = await writeProjectManifest({ ...opts, vaultRoot });
  await scaffoldMemoryRoot({ memoryRoot: projectRoot });

  if (opts.repoRoot) {
    const repoRoot = resolve(opts.repoRoot);
    await writePointer(repoRoot, vaultRoot, opts.projectId);
  }

  return { exitCode: 0, projectRoot };
}

async function copyDirNoConflict(input: {
  source: string;
  target: string;
  overwrite: boolean;
  skipNames?: Set<string>;
}): Promise<{ copied: number; skipped: number }> {
  let copied = 0;
  let skipped = 0;
  await mkdir(input.target, { recursive: true });
  const entries = await readdir(input.source, { withFileTypes: true });
  for (const entry of entries) {
    if (input.skipNames?.has(entry.name)) continue;
    const source = join(input.source, entry.name);
    const target = join(input.target, entry.name);
    if (entry.isDirectory()) {
      const child = await copyDirNoConflict({
        source,
        target,
        overwrite: input.overwrite,
        skipNames: input.skipNames,
      });
      copied += child.copied;
      skipped += child.skipped;
    } else if (entry.isFile()) {
      if (existsSync(target) && !input.overwrite) {
        skipped += 1;
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      copied += 1;
    }
  }
  return { copied, skipped };
}

export async function runProjectImportRepoVault(
  opts: ProjectImportOptions,
): Promise<ProjectCommandResult> {
  if (!opts.repoRoot) {
    return { exitCode: 1, message: "--repo is required for project import-repo-vault" };
  }
  const repoRoot = resolve(opts.repoRoot);
  const sourceVault = vaultPath(repoRoot);
  if (!existsSync(sourceVault)) {
    return { exitCode: 1, message: `no legacy .cairndex/ vault found at ${sourceVault}` };
  }

  const vaultRoot = resolve(opts.vaultRoot);
  if (!centralVaultExists(vaultRoot)) {
    return {
      exitCode: 1,
      message: `no central vault found at ${vaultRoot} (run \`cairndex vault init ${vaultRoot}\` first)`,
    };
  }
  const projectRoot = await writeProjectManifest({ ...opts, vaultRoot });

  const result = await copyDirNoConflict({
    source: sourceVault,
    target: projectRoot,
    overwrite: opts.overwrite ?? false,
    skipNames: new Set([".sync-conflicts"]),
  });
  await scaffoldMemoryRoot({ memoryRoot: projectRoot });

  await writePointer(repoRoot, vaultRoot, opts.projectId);

  const summary = `imported ${result.copied} file(s), skipped ${result.skipped} existing file(s)`;
  return {
    exitCode: 0,
    projectRoot,
    message: summary,
  };
}

export function defaultProjectIdFromRepo(repoRoot: string): string {
  return basename(resolve(repoRoot)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
