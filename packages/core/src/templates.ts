import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { centralSharedPath, centralVaultRootForProject, vaultPath } from "./paths.js";
import type { NodeType } from "./types.js";

const TEMPLATES_DIR = "templates";

export async function loadTemplate(repoRoot: string, type: NodeType): Promise<string | null> {
  const memoryRoot = vaultPath(repoRoot);
  const localPath = join(memoryRoot, TEMPLATES_DIR, `${type}.md`);
  if (existsSync(localPath)) return await readFile(localPath, "utf8");

  const centralVaultRoot = centralVaultRootForProject(memoryRoot);
  if (centralVaultRoot) {
    const sharedPath = join(centralSharedPath(centralVaultRoot), TEMPLATES_DIR, `${type}.md`);
    if (existsSync(sharedPath)) return await readFile(sharedPath, "utf8");
  }

  return null;
}

export function renderTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in ctx ? (ctx[key] ?? match) : match;
  });
}
