import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { z } from "zod";
import { centralVaultManifestPath } from "./paths.js";

export const VaultManifestSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    title: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
  })
  .passthrough();

export type VaultManifest = z.infer<typeof VaultManifestSchema>;

export function readVaultManifest(vaultRoot: string): VaultManifest | null {
  const path = centralVaultManifestPath(vaultRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA });
    const parsed = VaultManifestSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeVaultManifest(
  vaultRoot: string,
  manifest: VaultManifest,
): Promise<void> {
  await mkdir(vaultRoot, { recursive: true });
  await writeFile(centralVaultManifestPath(vaultRoot), yaml.dump(manifest), "utf8");
}
