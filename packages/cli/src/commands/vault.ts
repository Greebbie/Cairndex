import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { centralSharedPath, centralVaultManifestPath, writeVaultManifest } from "@cairndex/core";
import { findBundledTemplatesDir } from "../utils/bundledTemplates.js";
import { copyDirRecursive } from "../utils/scaffoldMemory.js";

export interface VaultInitOptions {
  path: string;
  title?: string;
}

export interface VaultInitResult {
  exitCode: 0 | 1;
  vaultRoot?: string;
  message?: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runVaultInit(opts: VaultInitOptions): Promise<VaultInitResult> {
  const vaultRoot = resolve(opts.path);
  await mkdir(vaultRoot, { recursive: true });
  await mkdir(join(vaultRoot, "projects"), { recursive: true });
  await mkdir(join(vaultRoot, "indexes"), { recursive: true });
  await mkdir(join(centralSharedPath(vaultRoot), "insights"), { recursive: true });
  await mkdir(join(centralSharedPath(vaultRoot), "patterns"), { recursive: true });

  const bundled = findBundledTemplatesDir();
  await copyDirRecursive(join(bundled, "rules"), join(centralSharedPath(vaultRoot), "rules"));
  await copyDirRecursive(
    join(bundled, "templates"),
    join(centralSharedPath(vaultRoot), "templates"),
  );

  if (!existsSync(centralVaultManifestPath(vaultRoot))) {
    await writeVaultManifest(vaultRoot, {
      schemaVersion: 1,
      title: opts.title ?? "Cairndex Vault",
      created: todayUtc(),
    });
  }

  return { exitCode: 0, vaultRoot };
}
