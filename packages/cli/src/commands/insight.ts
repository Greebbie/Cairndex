import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  defaultConfig,
  parseFrontmatter,
  serializeFrontmatter,
  sharedDir,
  vaultPath,
} from "@cairndex/core";

export interface InsightCmdInput {
  cwd: string;
  id: string;
}
export interface InsightCmdResult {
  exitCode: 0 | 1;
  message?: string;
}

async function findInsightFile(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  for (const e of entries) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    if (e.startsWith(`${id}-`) || e === `${id}.md`) return join(folder, e);
  }
  return null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runInsightPromote(input: InsightCmdInput): Promise<InsightCmdResult> {
  const projectInsightsDir = join(vaultPath(input.cwd), defaultConfig().folders.insights);
  const src = await findInsightFile(projectInsightsDir, input.id);
  if (!src) return { exitCode: 1, message: `insight ${input.id} not found in project` };

  const globalInsightsDir = join(sharedDir(), "insights");
  await mkdir(globalInsightsDir, { recursive: true });
  await copyFile(src, join(globalInsightsDir, basename(src)));

  // Mark project copy as promoted
  const raw = await readFile(src, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next = { ...data, promoted_to_global: true };
  await writeFile(src, serializeFrontmatter(next, content), "utf8");

  // Append change event
  const changelog = join(vaultPath(input.cwd), "changes/changelog.md");
  await mkdir(join(vaultPath(input.cwd), "changes"), { recursive: true });
  await appendFile(
    changelog,
    `- ${todayUtc()} — Promoted ${input.id} to global insights.\n`,
    "utf8",
  );

  return { exitCode: 0 };
}

export async function runInsightPull(input: InsightCmdInput): Promise<InsightCmdResult> {
  const globalInsightsDir = join(sharedDir(), "insights");
  const src = await findInsightFile(globalInsightsDir, input.id);
  if (!src) return { exitCode: 1, message: `insight ${input.id} not found in global` };

  const projectInsightsDir = join(vaultPath(input.cwd), defaultConfig().folders.insights);
  await mkdir(projectInsightsDir, { recursive: true });
  await copyFile(src, join(projectInsightsDir, basename(src)));

  const changelog = join(vaultPath(input.cwd), "changes/changelog.md");
  await mkdir(join(vaultPath(input.cwd), "changes"), { recursive: true });
  await appendFile(
    changelog,
    `- ${todayUtc()} — Pulled ${input.id} from global insights.\n`,
    "utf8",
  );

  return { exitCode: 0 };
}
