import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultConfig, writeSyncBaseline } from "@cairndex/core";
import yaml from "js-yaml";

export const MEMORY_FOLDERS = [
  "goals",
  "intents",
  "specs",
  "decisions",
  "plans",
  "tasks",
  "sessions",
  "changes",
  "insights",
  "questions",
  "context",
  "archive",
  "indexes",
  "indexes/context-packs",
  "inbox",
  "inbox/proposed-memory-updates",
] as const;

const INDEX_BODY = `---
phase: discovering
phase_since: __TODAY__
next_action: "TODO"
---

# Project Index

**Status:** initialized
**Active focus:** -

## Must-know now
- Central vault project memory lives in this project namespace.

## Recent changes

<!-- cairndex:recent-changes:start -->
- __TODAY__ - cairndex initialized.
<!-- cairndex:recent-changes:end -->

## Read next
- shared/rules/operating-rules.md
`;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function copyDirRecursive(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(src, entry.name);
    const target = join(dest, entry.name);
    if (entry.isDirectory()) await copyDirRecursive(source, target);
    else if (entry.isFile()) await copyFile(source, target);
  }
}

export async function scaffoldMemoryRoot(input: {
  memoryRoot: string;
  localRulesSource?: string;
  localTemplatesSource?: string;
  baselineRoot?: string;
}): Promise<void> {
  const memoryRoot = input.memoryRoot;
  await mkdir(memoryRoot, { recursive: true });
  for (const folder of MEMORY_FOLDERS) await mkdir(join(memoryRoot, folder), { recursive: true });

  if (input.localRulesSource) {
    await copyDirRecursive(input.localRulesSource, join(memoryRoot, "rules"));
  }
  if (input.localTemplatesSource) {
    await copyDirRecursive(input.localTemplatesSource, join(memoryRoot, "templates"));
  }

  const today = todayUtc();
  const indexPath = join(memoryRoot, "index.md");
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, INDEX_BODY.replaceAll("__TODAY__", today), "utf8");
  }

  const tasksDir = join(memoryRoot, "tasks");
  if (!existsSync(join(tasksDir, "current.md"))) {
    await writeFile(join(tasksDir, "current.md"), "# Current Tasks\n\n- (none)\n", "utf8");
  }
  if (!existsSync(join(tasksDir, "backlog.md"))) {
    await writeFile(join(tasksDir, "backlog.md"), "# Backlog\n\n- (none)\n", "utf8");
  }

  const changelogPath = join(memoryRoot, "changes", "changelog.md");
  if (!existsSync(changelogPath)) {
    await writeFile(changelogPath, `# Changelog\n\n- ${today} - cairndex initialized.\n`, "utf8");
  }

  const configPath = join(memoryRoot, "config.yaml");
  if (!existsSync(configPath)) {
    const cfg = defaultConfig();
    await writeFile(configPath, yaml.dump({ schemaVersion: cfg.schemaVersion }), "utf8");
  }

  if (input.baselineRoot && (input.localRulesSource || input.localTemplatesSource)) {
    const baseline: Record<string, string> = {};
    for (const sub of ["rules", "templates"]) {
      const dir = join(memoryRoot, sub);
      if (!existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur) continue;
        const entries = await readdir(cur, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(cur, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.isFile() && entry.name.endsWith(".md")) {
            baseline[full.slice(memoryRoot.length + 1).replace(/\\/g, "/")] = await readFile(
              full,
              "utf8",
            );
          }
        }
      }
    }
    await writeSyncBaseline(input.baselineRoot, baseline);
  }
}
