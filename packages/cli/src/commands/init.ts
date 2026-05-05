import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  applyCairndexBlock,
  defaultConfig,
  globalDir,
  registerProject,
  sharedDir,
  signalsPath,
  vaultPath,
  writeSyncBaseline,
} from "@cairndex/core";
import yaml from "js-yaml";
import { findBundledTemplatesDir } from "../utils/bundledTemplates.js";
import { applyClaudeHooks } from "../utils/hooks.js";
import { logger } from "../utils/logger.js";

const NODE_FOLDERS = [
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
  "rules",
  "templates",
  "archive",
  // Phase 1: derived index layer + Phase 2 inbox placeholder.
  "indexes",
  "indexes/context-packs",
  "inbox",
  "inbox/proposed-memory-updates",
  // Phase 1.3: low-trust signals directory (auto-distill / consolidate writers).
  "signals",
];

const INDEX_BODY = `---
phase: discovering
phase_since: __TODAY__
next_action: "TODO"
---

# Project Index

**Status:** initialized
**Active focus:** —

## Must-know now
- (Add references as decisions/specs accumulate.)

## Recent changes

<!-- cairndex:recent-changes:start -->
- __TODAY__ — cairndex initialized.
<!-- cairndex:recent-changes:end -->

## Read next
- \`.cairndex/rules/operating-rules.md\`
`;

const CAIRNDEX_BLOCK_BODY = `## cairndex Project Memory

This repository uses cairndex as a structured Markdown memory vault.

### Before starting meaningful work

1. Read \`.cairndex/index.md\` (entry point: phase, active focus, recent changes)
2. Read \`.cairndex/rules/operating-rules.md\` (how to interact with this vault)
3. Read relevant files under specs/, decisions/, plans/, tasks/, questions/

### After meaningful work

The cairndex watcher and PostToolUse/Stop hooks handle most maintenance automatically:
- Validation, normalization, backlinks: automatic on file save
- Session note: automatic on session end (Stop hook)
- Reciprocal links: automatic when you add a \`links\` entry

You should still:
- Update \`.cairndex/specs/\` when product behavior or scope changes
- Create a new ADR when a decision changes (mark old as \`superseded\`)
- Set \`status: done\` (or \`status: accepted\` for ADRs) only with a \`verification\` field
- Resolve \`.cairndex/questions/\` items as they're answered

### Treat \`.cairndex/\` as durable memory, not scratch notes

Do not silently rewrite history. Use typed-edge model (\`supersedes\`, \`superseded_by\`).
`;

export interface InitOptions {
  cwd: string;
  yes: boolean;
  claudeMd: boolean;
  hooks: boolean;
  alias?: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = join(src, e.name);
    const d = join(dest, e.name);
    if (e.isDirectory()) await copyDirRecursive(s, d);
    else if (e.isFile()) await copyFile(s, d);
  }
}

export async function runInit(opts: InitOptions): Promise<void> {
  const repoRoot = opts.cwd;
  // When a `.cairndex-project.yaml` pointer exists, this repo is already wired into a
  // central vault. We must NOT clobber that setup with a fresh legacy `.cairndex/`
  // skeleton — the user already migrated. In central mode `init` becomes a refresh
  // operation: re-apply Claude Code hooks + MCP wiring + CLAUDE.md block, nothing else.
  const pointerPath = join(repoRoot, ".cairndex-project.yaml");
  const hasCentralPointer = existsSync(pointerPath);
  const vault = vaultPath(repoRoot);
  logger.info(
    { repoRoot, layout: hasCentralPointer ? "central" : "legacy" },
    "initializing cairndex",
  );

  if (!hasCentralPointer) {
    // 1. Skeleton (legacy repo-local layout only)
    await mkdir(vault, { recursive: true });
    for (const f of NODE_FOLDERS) await mkdir(join(vault, f), { recursive: true });

    // 2. Copy rules/templates from global; fall back to bundled defaults.
    const globalShared = sharedDir();
    const bundled = findBundledTemplatesDir();
    const ruleSrc = existsSync(join(globalShared, "rules"))
      ? join(globalShared, "rules")
      : join(bundled, "rules");
    const tplSrc = existsSync(join(globalShared, "templates"))
      ? join(globalShared, "templates")
      : join(bundled, "templates");
    await copyDirRecursive(ruleSrc, join(vault, "rules"));
    await copyDirRecursive(tplSrc, join(vault, "templates"));

    // 3. Generate seed files (idempotent: do not overwrite if present).
    const today = todayUtc();
    const indexPath = join(vault, "index.md");
    if (!existsSync(indexPath)) {
      await writeFile(indexPath, INDEX_BODY.replaceAll("__TODAY__", today), "utf8");
    }
    const tasksDir = join(vault, "tasks");
    if (!existsSync(join(tasksDir, "current.md"))) {
      await writeFile(join(tasksDir, "current.md"), "# Current Tasks\n\n- (none)\n", "utf8");
    }
    if (!existsSync(join(tasksDir, "backlog.md"))) {
      await writeFile(join(tasksDir, "backlog.md"), "# Backlog\n\n- (none)\n", "utf8");
    }
    const changelogPath = join(vault, "changes", "changelog.md");
    if (!existsSync(changelogPath)) {
      await writeFile(changelogPath, `# Changelog\n\n- ${today} — cairndex initialized.\n`, "utf8");
    }

    // 4. config.yaml (only write if missing — preserve user overrides)
    const configPathStr = join(vault, "config.yaml");
    if (!existsSync(configPathStr)) {
      const cfg = defaultConfig();
      await writeFile(configPathStr, yaml.dump({ schemaVersion: cfg.schemaVersion }), "utf8");
    }
  }

  // 4b. signals/ directory — ensure it exists in both layouts (idempotent).
  await mkdir(signalsPath(repoRoot), { recursive: true });

  // 5. CLAUDE.md (universal — both layouts get the agent-surface block)
  if (opts.claudeMd) {
    const claudePath = join(repoRoot, "CLAUDE.md");
    let existing: string | undefined;
    if (existsSync(claudePath)) existing = await readFile(claudePath, "utf8");
    const result = applyCairndexBlock(existing, CAIRNDEX_BLOCK_BODY);
    await writeFile(claudePath, result.updated, "utf8");
    logger.info({ action: result.action }, "CLAUDE.md updated");
  }

  // 6. Hooks (universal — both layouts get hooks + MCP wiring; applyClaudeHooks
  //    detects the layout itself and emits central-aware command lines.)
  if (opts.hooks) {
    await applyClaudeHooks(repoRoot);
    logger.info("Claude Code hooks written");
  }

  if (!hasCentralPointer) {
    // 7. Sync baseline (hashes of currently copied rules/templates) — meaningless
    //    in central mode where the vault lives outside the repo and we did not
    //    populate the legacy folder.
    const baseline: Record<string, string> = {};
    for (const sub of ["rules", "templates"]) {
      const dir = join(vault, sub);
      if (!existsSync(dir)) continue;
      const stack = [dir];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur) continue;
        const entries = await readdir(cur, { withFileTypes: true });
        for (const e of entries) {
          const full = join(cur, e.name);
          if (e.isDirectory()) stack.push(full);
          else if (e.isFile() && e.name.endsWith(".md")) {
            baseline[full.slice(vault.length + 1).replace(/\\/g, "/")] = await readFile(
              full,
              "utf8",
            );
          }
        }
      }
    }
    await writeSyncBaseline(repoRoot, baseline);
  }

  // 8. Register globally (universal — both layouts benefit from the registry entry
  //    so `cairndex ui` shows this project in the sidebar).
  await mkdir(globalDir(), { recursive: true });
  await registerProject({
    path: repoRoot,
    alias: opts.alias ?? basename(repoRoot),
  });

  logger.info("cairndex init complete");

  // 9. Final tip — accurate per layout.
  console.log("");
  if (hasCentralPointer) {
    console.log(
      `Refreshed Claude Code hooks + MCP wiring against the central vault referenced by ${pointerPath}.`,
    );
    console.log(
      "(Legacy `.cairndex/` skeleton skipped — this repo is already on the central layout.)",
    );
  } else {
    console.log(
      "Tip: this created a legacy repo-local vault. The canonical layout is a central vault:",
    );
    console.log("  cairndex vault init <path>");
    console.log("  cairndex project import-repo-vault --vault <path> --project <id> --repo <repo>");
  }
}
