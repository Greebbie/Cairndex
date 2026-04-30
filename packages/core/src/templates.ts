import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "./paths.js";
import type { NodeType } from "./types.js";

const TEMPLATES_DIR = "templates";

export async function loadTemplate(repoRoot: string, type: NodeType): Promise<string | null> {
  const path = join(vaultPath(repoRoot), TEMPLATES_DIR, `${type}.md`);
  if (!existsSync(path)) return null;
  return await readFile(path, "utf8");
}

export function renderTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in ctx ? (ctx[key] ?? match) : match;
  });
}
