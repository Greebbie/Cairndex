# cairndex Plan 3 — CLI Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/cli` — the user-facing `cairndex` command that wraps `@cairndex/core` into 4 commands (`init`, `ui`, `sync`, `doctor`) plus the `insight promote/pull` namespace, distributable via `npm i -g cairndex`.

**Architecture:** Thin command-line wrapper around `@cairndex/core`. No business logic; all heavy lifting in core. Commands are TS modules under `src/commands/`, dispatched by commander in `src/bin.ts`. `ui` is a stub here; Plan 4 wires it to the real server.

**Tech Stack:** commander, prompts, pino, pino-pretty, kleur (terminal colors), open (browser launcher; for ui in Plan 4), tsup (build), vitest (test).

**Spec:** `docs/superpowers/specs/2026-04-30-cairndex-design.md` §7, §9.

**Working directory:** `C:\Users\lvbab\Documents\GitHub\Cairndex`

**Prerequisites:** Plans 1 and 2 merged. `@cairndex/core` exports listed in Plan 2 Task 8 are all present.

---

## File Structure

```
packages/cli/
  package.json                 # bin: { "cairndex": "./bin/cairndex" }
  tsconfig.json
  tsup.config.ts
  bin/cairndex                 # node shim → dist/bin.cjs
  src/
    bin.ts                     # commander entry
    commands/
      init.ts
      doctor.ts
      sync.ts
      ui.ts                    # stub
      insight.ts               # subcommands: promote, pull
    utils/
      logger.ts                # pino with pretty CLI
      paths.ts                 # findRepoRoot
      hooks.ts                 # merge .claude/settings.json hooks
      bundledTemplates.ts      # find shipped templates/ relative to install
      mtimeStore.ts            # .doctor-mtime tracking
  tests/
    init.test.ts
    doctor.test.ts
    sync.test.ts
    insight.test.ts
    bin.test.ts                # spawn the binary, smoke test help/version
    fixtures/
      bundled-templates/       # mirror of repo-root templates/ for tests
```

---

## Task 1: Scaffold `packages/cli`

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/bin/cairndex`
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/utils/logger.ts`
- Create: `packages/cli/src/utils/paths.ts`

- [ ] **Step 1: Write `packages/cli/package.json`**

```json
{
  "name": "cairndex",
  "version": "0.0.0",
  "description": "Lightweight Markdown-native project memory for AI-assisted coding",
  "type": "module",
  "bin": { "cairndex": "./bin/cairndex" },
  "files": ["bin", "dist", "templates"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@cairndex/core": "workspace:*",
    "commander": "^12.1.0",
    "kleur": "^4.1.5",
    "open": "^10.1.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "prompts": "^2.4.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/prompts": "^2.4.9"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 2: Write `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/cli/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["cjs"],         // CJS for the bin shim → broader Node compatibility
  outExtension: () => ({ js: ".cjs" }),
  dts: false,
  clean: true,
  sourcemap: true,
  target: "node20",
  shims: true,             // add __dirname/import.meta.url shims for CJS
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Write `packages/cli/bin/cairndex`**

```sh
#!/usr/bin/env node
require("../dist/bin.cjs");
```

(Make executable on Unix: `chmod +x packages/cli/bin/cairndex`. Windows uses npm's `cmd-shim`.)

- [ ] **Step 5: Write `packages/cli/src/utils/logger.ts`**

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.CAIRNDEX_LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname,time",
      singleLine: true,
    },
  },
});

export function silent() {
  logger.level = "silent";
}
```

- [ ] **Step 6: Write `packages/cli/src/utils/paths.ts`**

```ts
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(`${dir}/.git`)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(startDir); // no .git found, fall back
    dir = parent;
  }
}
```

- [ ] **Step 7: Write `packages/cli/src/bin.ts`**

```ts
import { Command } from "commander";

const program = new Command();

program
  .name("cairndex")
  .description("Markdown-native project memory for AI-assisted coding")
  .version("0.0.0");

// Commands wired in subsequent tasks
program.command("init").description("Initialize cairndex in the current repo").action(() => {
  console.log("init: not yet implemented (Task 2)");
});
program.command("doctor").description("Validate vault, show status").action(() => {
  console.log("doctor: not yet implemented (Task 3)");
});
program.command("sync").description("Sync shared rules/templates from global to project").action(() => {
  console.log("sync: not yet implemented (Task 4)");
});
program.command("ui").description("Launch local web GUI (stub in Plan 3)").action(() => {
  console.log("ui: GUI not yet built — coming in Plan 4. Run `cairndex doctor` for now.");
});

program.parseAsync(process.argv);
```

- [ ] **Step 8: Install deps and build**

```bash
pnpm install
pnpm -F cairndex build
```

Expected: `packages/cli/dist/bin.cjs` produced.

- [ ] **Step 9: Smoke-run the binary**

```bash
node packages/cli/bin/cairndex --help
node packages/cli/bin/cairndex --version
```

Expected: help text lists `init`, `doctor`, `sync`, `ui`. Version prints `0.0.0`.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/ pnpm-lock.yaml
git commit -m "feat(cli): scaffold cairndex CLI package with commander entry"
```

---

## Task 2: `cairndex init` Command

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/utils/hooks.ts`
- Create: `packages/cli/src/utils/bundledTemplates.ts`
- Create: `packages/cli/tests/init.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../src/commands/init.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-init-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  mkdirSync(join(tmp, ".git"));
  process.env.CAIRNDEX_HOME = home;
});
afterEach(() => {
  delete process.env.CAIRNDEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("init", () => {
  it("creates .cairndex/ skeleton with all 10 node folders", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    for (const f of [
      "goals", "intents", "specs", "decisions", "plans", "tasks",
      "sessions", "changes", "insights", "questions", "context",
      "rules", "templates", "archive",
    ]) {
      expect(existsSync(join(tmp, ".cairndex", f)), f).toBe(true);
    }
  });

  it("writes config.yaml, index.md, baseline, and registers globally", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true, alias: "test-proj" });
    expect(existsSync(join(tmp, ".cairndex/config.yaml"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/index.md"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/.sync-baseline.json"))).toBe(true);
    const registry = JSON.parse(readFileSync(join(home, "projects.json"), "utf8"));
    expect(registry.projects).toHaveLength(1);
    expect(registry.projects[0].alias).toBe("test-proj");
  });

  it("merges cairndex block into existing CLAUDE.md", async () => {
    writeFileSync(join(tmp, "CLAUDE.md"), "# My project\n\nUser content.\n");
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const updated = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    expect(updated).toContain("User content.");
    expect(updated).toContain("<!-- cairndex:start v1 -->");
    expect(updated).toContain("<!-- cairndex:end -->");
  });

  it("writes Claude Code hook stanzas to .claude/settings.json", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    const settings = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    expect(settings.hooks?.PostToolUse).toBeDefined();
    expect(settings.hooks?.Stop).toBeDefined();
    expect(JSON.stringify(settings.hooks)).toContain("cairndex doctor");
  });

  it("preserves existing .claude/settings.json hooks", async () => {
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude/settings.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Bash", command: "echo user-hook" }] } }, null, 2),
    );
    await runInit({ cwd: tmp, yes: true, claudeMd: false, hooks: true });
    const s = JSON.parse(readFileSync(join(tmp, ".claude/settings.json"), "utf8"));
    const post = s.hooks.PostToolUse as Array<{ command: string }>;
    expect(post.some((h) => h.command === "echo user-hook")).toBe(true);
    expect(post.some((h) => String(h.command).includes("cairndex doctor"))).toBe(true);
  });

  it("idempotent: re-running init does not duplicate or break content", async () => {
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const before = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    await runInit({ cwd: tmp, yes: true, claudeMd: true, hooks: true });
    const after = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
    // The cairndex block content might refresh, but markers should still appear exactly once each
    expect(after.match(/<!-- cairndex:start v1 -->/g)?.length).toBe(1);
    expect(after.match(/<!-- cairndex:end -->/g)?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test init.test`

- [ ] **Step 3: Write `packages/cli/src/utils/bundledTemplates.ts`**

```ts
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// At runtime, this module is at:
//   <pkg-root>/dist/bin.cjs (after build) or via vitest from src/utils/.
// We look for `templates/` adjacent to either the package root or two levels up
// (for monorepo dev where templates/ is at the repo root).
export function findBundledTemplatesDir(): string {
  const here =
    typeof __dirname !== "undefined"
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));

  const candidates = [
    join(here, "..", "templates"),         // packaged: <pkg>/templates next to dist
    join(here, "..", "..", "templates"),   // monorepo dev: <repo-root>/templates
    join(here, "..", "..", "..", "templates"),
    resolve(process.cwd(), "templates"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error("bundled templates directory not found");
}
```

- [ ] **Step 4: Write `packages/cli/src/utils/hooks.ts`**

```ts
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface HookEntry {
  matcher?: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

const CAIRNDEX_HOOK_TAG = "cairndex-managed";

const CAIRNDEX_HOOKS = {
  PostToolUse: [
    {
      matcher: "Write|Edit",
      command: `cairndex doctor --silent --fix --scope changed --filter-path .cairndex/ # ${CAIRNDEX_HOOK_TAG}`,
    },
  ],
  Stop: [
    { command: `cairndex doctor --silent --auto-session # ${CAIRNDEX_HOOK_TAG}` },
  ],
};

export async function applyClaudeHooks(repoRoot: string): Promise<void> {
  const path = join(repoRoot, ".claude", "settings.json");
  let existing: ClaudeSettings = {};
  if (existsSync(path)) {
    try { existing = JSON.parse(await readFile(path, "utf8")) as ClaudeSettings; }
    catch { existing = {}; }
  }
  existing.hooks = existing.hooks ?? {};
  for (const evt of ["PostToolUse", "Stop"] as const) {
    const list = (existing.hooks[evt] ?? []) as HookEntry[];
    // remove any prior cairndex-managed entries (idempotent)
    const filtered = list.filter((h) => !String(h.command).includes(CAIRNDEX_HOOK_TAG));
    existing.hooks[evt] = [...filtered, ...CAIRNDEX_HOOKS[evt]];
  }
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
```

- [ ] **Step 5: Write `packages/cli/src/commands/init.ts`**

```ts
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  applyCairndexBlock,
  defaultConfig,
  globalDir,
  registerProject,
  sharedDir,
  vaultPath,
  writeSyncBaseline,
} from "@cairndex/core";
import yaml from "js-yaml";
import { logger } from "../utils/logger.js";
import { findBundledTemplatesDir } from "../utils/bundledTemplates.js";
import { applyClaudeHooks } from "../utils/hooks.js";

const NODE_FOLDERS = [
  "goals", "intents", "specs", "decisions", "plans", "tasks",
  "sessions", "changes", "insights", "questions", "context",
  "rules", "templates", "archive",
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
- __TODAY__ — cairndex initialized.

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
  const vault = vaultPath(repoRoot);
  logger.info({ repoRoot }, "initializing cairndex");

  // 1. Skeleton
  await mkdir(vault, { recursive: true });
  for (const f of NODE_FOLDERS) await mkdir(join(vault, f), { recursive: true });

  // 2. Copy rules/templates from global; fall back to bundled defaults.
  const globalShared = sharedDir();
  const bundled = findBundledTemplatesDir();
  const ruleSrc = existsSync(join(globalShared, "rules")) ? join(globalShared, "rules") : join(bundled, "rules");
  const tplSrc = existsSync(join(globalShared, "templates")) ? join(globalShared, "templates") : join(bundled, "templates");
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
  const configPath = join(vault, "config.yaml");
  if (!existsSync(configPath)) {
    const cfg = defaultConfig();
    await writeFile(configPath, yaml.dump({ schemaVersion: cfg.schemaVersion }), "utf8");
  }

  // 5. CLAUDE.md
  if (opts.claudeMd) {
    const claudePath = join(repoRoot, "CLAUDE.md");
    let existing: string | undefined;
    if (existsSync(claudePath)) existing = await readFile(claudePath, "utf8");
    const result = applyCairndexBlock(existing, CAIRNDEX_BLOCK_BODY);
    await writeFile(claudePath, result.updated, "utf8");
    logger.info({ action: result.action }, "CLAUDE.md updated");
  }

  // 6. Hooks
  if (opts.hooks) {
    await applyClaudeHooks(repoRoot);
    logger.info("Claude Code hooks written");
  }

  // 7. Sync baseline (hashes of currently copied rules/templates)
  const baseline: Record<string, string> = {};
  for (const sub of ["rules", "templates"]) {
    const dir = join(vault, sub);
    if (!existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      const entries = await readdir(cur, { withFileTypes: true });
      for (const e of entries) {
        const full = join(cur, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.isFile() && e.name.endsWith(".md")) {
          baseline[full.slice(vault.length + 1).replace(/\\/g, "/")] = await readFile(full, "utf8");
        }
      }
    }
  }
  await writeSyncBaseline(repoRoot, baseline);

  // 8. Register globally
  await mkdir(globalDir(), { recursive: true });
  await registerProject({
    path: repoRoot,
    alias: opts.alias ?? basename(repoRoot),
  });

  logger.info("cairndex init complete");
}
```

- [ ] **Step 6: Wire `init` into `bin.ts`**

Replace the placeholder action with:

```ts
import { runInit } from "./commands/init.js";

program
  .command("init")
  .description("Initialize cairndex in the current repo")
  .option("--cwd <path>", "Working directory (default: current directory)", process.cwd())
  .option("--yes", "Skip interactive prompts", false)
  .option("--no-claude-md", "Do not modify CLAUDE.md")
  .option("--no-hooks", "Do not write .claude/settings.json hooks")
  .option("--alias <name>", "Project alias for the global registry")
  .action(async (opts) => {
    await runInit({
      cwd: opts.cwd,
      yes: opts.yes,
      claudeMd: opts.claudeMd !== false,
      hooks: opts.hooks !== false,
      alias: opts.alias,
    });
  });
```

- [ ] **Step 7: Add yaml dep to cli (already installed at workspace level via core, but explicit is safer)**

```bash
pnpm -F cairndex add js-yaml
pnpm -F cairndex add -D @types/js-yaml
```

- [ ] **Step 8: Run test, expect pass**

Run: `pnpm test init.test`
Expected: 6 PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): add cairndex init command"
```

---

## Task 3: `cairndex doctor` Command

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/utils/mtimeStore.ts`
- Create: `packages/cli/tests/doctor.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-dr-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("doctor", () => {
  it("returns exit code 0 on a valid vault", async () => {
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n---\n");
    const r = await runDoctor({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(0);
  });

  it("returns exit code 1 when there are errors", async () => {
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    // status: done without verification → error
    const r = await runDoctor({ cwd: tmp, silent: true });
    expect(r.exitCode).toBe(1);
  });

  it("--fix resolves auto-fixable issues", async () => {
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(f,
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ntags: [\"Foo Bar\"]\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    await runDoctor({ cwd: tmp, silent: true, fix: true });
    const after = readFileSync(f, "utf8");
    expect(after).toContain("foo-bar");
    expect(after).not.toContain("Foo Bar");
  });

  it("--filter-path scopes to files under given prefix", async () => {
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    // run doctor with filter that excludes specs → no errors despite the broken spec
    const r = await runDoctor({ cwd: tmp, silent: true, filterPath: ".cairndex/decisions/" });
    expect(r.exitCode).toBe(0);
  });

  it("--auto-session generates a session file when no transcript provided", async () => {
    mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    await runDoctor({ cwd: tmp, silent: true, autoSession: true });
    const { readdirSync } = await import("node:fs");
    const sessions = readdirSync(join(tmp, ".cairndex/sessions"));
    expect(sessions.some((f) => f.endsWith(".md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Write `packages/cli/src/utils/mtimeStore.ts`**

```ts
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

interface MTimes { [absPath: string]: number }

export async function readMtimeStore(repoRoot: string): Promise<MTimes> {
  const p = join(repoRoot, ".cairndex/.doctor-mtime.json");
  if (!existsSync(p)) return {};
  try { return JSON.parse(await readFile(p, "utf8")) as MTimes; } catch { return {}; }
}

export async function writeMtimeStore(repoRoot: string, m: MTimes): Promise<void> {
  const p = join(repoRoot, ".cairndex/.doctor-mtime.json");
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(m, null, 2), "utf8");
}

export function pathChangedSince(absPath: string, lastSeenMs: number | undefined): boolean {
  if (!existsSync(absPath)) return false;
  const m = statSync(absPath).mtimeMs;
  return lastSeenMs == null || m > lastSeenMs;
}
```

- [ ] **Step 4: Write `packages/cli/src/commands/doctor.ts`**

```ts
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  applyAutoFixes,
  defaultConfig,
  generateAutoSession,
  loadProjectConfig,
  runValidation,
  vaultPath,
  type ValidationIssue,
} from "@cairndex/core";
import kleur from "kleur";
import { logger, silent as makeSilent } from "../utils/logger.js";
import { readMtimeStore, writeMtimeStore } from "../utils/mtimeStore.js";

export interface DoctorOptions {
  cwd: string;
  silent?: boolean;
  fix?: boolean;
  scope?: "changed" | "all";
  autoSession?: boolean;
  filterPath?: string;
}

export interface DoctorResult {
  exitCode: 0 | 1;
  issues: ValidationIssue[];
}

function severityColor(sev: ValidationIssue["severity"]): (s: string) => string {
  switch (sev) {
    case "error": return kleur.red;
    case "warn":  return kleur.yellow;
    case "info":  return kleur.blue;
  }
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorResult> {
  if (opts.silent) makeSilent();
  const cwd = opts.cwd;

  const cfg = existsSync(join(vaultPath(cwd), "config.yaml"))
    ? loadProjectConfig(cwd)
    : defaultConfig();

  let issues = await runValidation(cwd, cfg);

  // --filter-path
  if (opts.filterPath) {
    const prefix = opts.filterPath.replace(/[\\/]+$/, "");
    issues = issues.filter((i) => i.path && i.path.includes(prefix));
  }

  // --scope changed: keep issues whose path was modified since last doctor run
  if (opts.scope === "changed") {
    const store = await readMtimeStore(cwd);
    issues = issues.filter((i) => {
      if (!i.path || !existsSync(i.path)) return false;
      const m = statSync(i.path).mtimeMs;
      const last = store[i.path];
      return last == null || m > last;
    });
    // update store
    const fresh: Record<string, number> = {};
    for (const i of issues) if (i.path && existsSync(i.path)) fresh[i.path] = statSync(i.path).mtimeMs;
    await writeMtimeStore(cwd, fresh);
  }

  // --fix
  if (opts.fix) {
    const r = await applyAutoFixes(cwd, cfg, issues);
    if (r.fixed.length > 0) {
      logger.info({ count: r.fixed.length }, "auto-fixed issues");
    }
    // re-run validation to refresh the issue list after fixes
    issues = await runValidation(cwd, cfg);
    if (opts.filterPath) {
      const prefix = opts.filterPath.replace(/[\\/]+$/, "");
      issues = issues.filter((i) => i.path && i.path.includes(prefix));
    }
  }

  // --auto-session
  if (opts.autoSession) {
    const touched: string[] = [];
    const vault = vaultPath(cwd);
    if (existsSync(vault)) {
      // Trivial fallback: list everything modified in the last hour.
      const cutoff = Date.now() - 60 * 60 * 1000;
      const stack = [vault];
      while (stack.length) {
        const cur = stack.pop()!;
        const entries = await readdir(cur, { withFileTypes: true });
        for (const e of entries) {
          const full = join(cur, e.name);
          if (e.isDirectory() && e.name !== "archive" && !e.name.startsWith(".")) {
            stack.push(full);
          } else if (e.isFile() && e.name.endsWith(".md")) {
            const m = statSync(full).mtimeMs;
            if (m >= cutoff) touched.push(full);
          }
        }
      }
    }
    await generateAutoSession({
      repoRoot: cwd,
      cfg,
      now: new Date(),
      touchedPaths: touched,
      summary: "",
      agentName: "cairndex-auto-session",
    });
  }

  // print issues unless silent
  if (!opts.silent) {
    if (issues.length === 0) {
      console.log(kleur.green("✓ vault is clean"));
    } else {
      const errors = issues.filter((i) => i.severity === "error");
      const warns = issues.filter((i) => i.severity === "warn");
      const infos = issues.filter((i) => i.severity === "info");
      for (const list of [errors, warns, infos]) {
        for (const i of list) {
          const color = severityColor(i.severity);
          const tag = color(i.severity.toUpperCase().padEnd(5));
          console.log(`${tag} ${i.rule}: ${i.message}`);
        }
      }
      console.log();
      console.log(`${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info`);
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  return { exitCode: hasError ? 1 : 0, issues };
}
```

- [ ] **Step 5: Wire into `bin.ts`**

```ts
import { runDoctor } from "./commands/doctor.js";

program
  .command("doctor")
  .description("Validate vault, show status, optionally auto-fix")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--fix", "Auto-fix safe issues", false)
  .option("--silent", "No output, exit code only", false)
  .option("--scope <mode>", "Validation scope: changed | all", "all")
  .option("--auto-session", "Generate a session note from the recent transcript", false)
  .option("--filter-path <prefix>", "Only check files under this path prefix")
  .action(async (opts) => {
    const r = await runDoctor({
      cwd: opts.cwd,
      silent: opts.silent,
      fix: opts.fix,
      scope: opts.scope,
      autoSession: opts.autoSession,
      filterPath: opts.filterPath,
    });
    process.exit(r.exitCode);
  });
```

- [ ] **Step 6: Run test**

Run: `pnpm test doctor.test`
Expected: 5 PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add cairndex doctor with --fix, --silent, --scope, --auto-session"
```

---

## Task 4: `cairndex sync` Command

**Files:**
- Create: `packages/cli/src/commands/sync.ts`
- Create: `packages/cli/tests/sync.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSyncCmd } from "../src/commands/sync.js";

let tmp: string;
let home: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-sync-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
  mkdirSync(join(home, "shared/rules"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/rules"), { recursive: true });
});
afterEach(() => {
  delete process.env.CAIRNDEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("sync command", () => {
  it("fast-forwards when only global changed", async () => {
    writeFileSync(join(home, "shared/rules/operating-rules.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/rules/operating-rules.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/.sync-baseline.json"),
      JSON.stringify({ hashes: { "rules/operating-rules.md": require("node:crypto").createHash("sha256").update("v1\n").digest("hex") } }));
    writeFileSync(join(home, "shared/rules/operating-rules.md"), "v2\n");
    const r = await runSyncCmd({ cwd: tmp });
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(tmp, ".cairndex/rules/operating-rules.md"), "utf8")).toBe("v2\n");
  });

  it("returns exit code 1 when conflicts exist", async () => {
    writeFileSync(join(home, "shared/rules/r.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/rules/r.md"), "v1\n");
    writeFileSync(join(tmp, ".cairndex/.sync-baseline.json"),
      JSON.stringify({ hashes: { "rules/r.md": require("node:crypto").createHash("sha256").update("v1\n").digest("hex") } }));
    writeFileSync(join(home, "shared/rules/r.md"), "v-global\n");
    writeFileSync(join(tmp, ".cairndex/rules/r.md"), "v-local\n");
    const r = await runSyncCmd({ cwd: tmp });
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(tmp, ".cairndex/.sync-conflicts/rules/r.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Write `packages/cli/src/commands/sync.ts`**

```ts
import { runSync, sharedDir } from "@cairndex/core";
import kleur from "kleur";
import { logger, silent as makeSilent } from "../utils/logger.js";

export interface SyncCmdOptions {
  cwd: string;
  silent?: boolean;
}

export interface SyncCmdResult { exitCode: 0 | 1 }

export async function runSyncCmd(opts: SyncCmdOptions): Promise<SyncCmdResult> {
  if (opts.silent) makeSilent();
  const r = await runSync({ globalDir: sharedDir(), projectDir: opts.cwd });

  if (!opts.silent) {
    console.log(`${kleur.green("✓")} fast-forwarded: ${r.fastForwarded.length}`);
    for (const f of r.fastForwarded) console.log(`  ${f}`);
    console.log(`${kleur.yellow("•")} kept local edits: ${r.skippedLocalEdits.length}`);
    for (const f of r.skippedLocalEdits) console.log(`  ${f}`);
    console.log(`${kleur.red("⚠")} conflicts: ${r.conflicts.length}`);
    for (const f of r.conflicts) console.log(`  ${f} → see .cairndex/.sync-conflicts/`);
  }

  void logger;
  return { exitCode: r.conflicts.length > 0 ? 1 : 0 };
}
```

- [ ] **Step 4: Wire into `bin.ts`**

```ts
import { runSyncCmd } from "./commands/sync.js";

program
  .command("sync")
  .description("Sync rules and templates from global ~/.cairndex/shared into project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--silent", "No output, exit code only", false)
  .action(async (opts) => {
    const r = await runSyncCmd({ cwd: opts.cwd, silent: opts.silent });
    process.exit(r.exitCode);
  });
```

- [ ] **Step 5: Run test**

Run: `pnpm test sync.test`
Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add cairndex sync command"
```

---

## Task 5: `cairndex insight promote/pull`

**Files:**
- Create: `packages/cli/src/commands/insight.ts`
- Create: `packages/cli/tests/insight.test.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInsightPromote, runInsightPull } from "../src/commands/insight.js";

let tmp: string;
let home: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-ins-"));
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
  mkdirSync(join(home, "shared/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/insights"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/changes"), { recursive: true });
});
afterEach(() => {
  delete process.env.CAIRNDEX_HOME;
  rmSync(tmp, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("insight commands", () => {
  it("promote copies file to global and marks promoted_to_global", async () => {
    writeFileSync(join(tmp, ".cairndex/insights/INS-001-x.md"),
      "---\nid: INS-001\ntitle: X\nstatus: stable\ncreated: 2026-04-30\n---\n## Pattern\nfoo\n");
    const r = await runInsightPromote({ cwd: tmp, id: "INS-001" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(home, "shared/insights/INS-001-x.md"))).toBe(true);
    const projectAfter = readFileSync(join(tmp, ".cairndex/insights/INS-001-x.md"), "utf8");
    expect(projectAfter).toContain("promoted_to_global: true");
  });

  it("pull copies global insight into the current project", async () => {
    writeFileSync(join(home, "shared/insights/INS-007-y.md"),
      "---\nid: INS-007\ntitle: Y\nstatus: stable\ncreated: 2026-04-30\n---\n## Pattern\nbar\n");
    const r = await runInsightPull({ cwd: tmp, id: "INS-007" });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(tmp, ".cairndex/insights/INS-007-y.md"))).toBe(true);
  });

  it("promote fails if insight not found", async () => {
    const r = await runInsightPromote({ cwd: tmp, id: "INS-999" });
    expect(r.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Write `packages/cli/src/commands/insight.ts`**

```ts
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  defaultConfig,
  parseFrontmatter,
  serializeFrontmatter,
  sharedDir,
  vaultPath,
} from "@cairndex/core";

export interface InsightCmdInput { cwd: string; id: string }
export interface InsightCmdResult { exitCode: 0 | 1; message?: string }

async function findInsightFile(folder: string, id: string): Promise<string | null> {
  if (!existsSync(folder)) return null;
  const entries = await readdir(folder);
  for (const e of entries) {
    if (!e.endsWith(".md") || e.toLowerCase() === "readme.md") continue;
    if (e.startsWith(`${id}-`) || e === `${id}.md`) return join(folder, e);
  }
  return null;
}

function todayUtc(): string { return new Date().toISOString().slice(0, 10); }

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
  data.promoted_to_global = true;
  await writeFile(src, serializeFrontmatter(data, content), "utf8");

  // Append change event
  const changelog = join(vaultPath(input.cwd), "changes/changelog.md");
  await mkdir(join(vaultPath(input.cwd), "changes"), { recursive: true });
  await appendFile(changelog, `- ${todayUtc()} — Promoted ${input.id} to global insights.\n`, "utf8");

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
  await appendFile(changelog, `- ${todayUtc()} — Pulled ${input.id} from global insights.\n`, "utf8");

  return { exitCode: 0 };
}
```

- [ ] **Step 4: Wire into `bin.ts`**

```ts
import { runInsightPromote, runInsightPull } from "./commands/insight.js";

const insight = program.command("insight").description("Cross-project insight management");

insight
  .command("promote <id>")
  .description("Promote a project insight to ~/.cairndex/shared/insights/")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (id, opts) => {
    const r = await runInsightPromote({ cwd: opts.cwd, id });
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });

insight
  .command("pull <id>")
  .description("Pull a global insight into the current project")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (id, opts) => {
    const r = await runInsightPull({ cwd: opts.cwd, id });
    if (r.message) console.error(r.message);
    process.exit(r.exitCode);
  });
```

- [ ] **Step 5: Run test**

Run: `pnpm test insight.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add cairndex insight promote/pull subcommands"
```

---

## Task 6: `cairndex ui` Stub

**Files:**
- Create: `packages/cli/src/commands/ui.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: Write `packages/cli/src/commands/ui.ts`**

```ts
import kleur from "kleur";

export function runUiStub(): void {
  console.log(kleur.yellow("cairndex ui — GUI not yet built (Plan 4)."));
  console.log("In the meantime, use:");
  console.log("  cairndex doctor   — vault status & validation");
  console.log("  cairndex sync     — pull updates from ~/.cairndex/shared/");
}
```

- [ ] **Step 2: Replace stub action in `bin.ts`**

```ts
import { runUiStub } from "./commands/ui.js";

program
  .command("ui")
  .description("Launch local web GUI (stub in v0.1; full impl in Plan 4)")
  .action(() => { runUiStub(); });
```

- [ ] **Step 3: Smoke test (no separate test file)**

Run: `pnpm -F cairndex build && node packages/cli/bin/cairndex ui`
Expected: stub message printed.

- [ ] **Step 4: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add cairndex ui stub (full impl in Plan 4)"
```

---

## Task 7: Build, Help, Bin Smoke Test

**Files:**
- Create: `packages/cli/tests/bin.test.ts`

- [ ] **Step 1: Write the failing smoke test**

```ts
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BIN = join(__dirname, "..", "bin", "cairndex");
const NODE_OPTS = { encoding: "utf8" as const };

describe("bin smoke", () => {
  it("--help prints command list", () => {
    const r = spawnSync(process.execPath, [BIN, "--help"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("init");
    expect(r.stdout).toContain("doctor");
    expect(r.stdout).toContain("sync");
    expect(r.stdout).toContain("ui");
  });

  it("--version prints semver", () => {
    const r = spawnSync(process.execPath, [BIN, "--version"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("ui prints stub message", () => {
    const r = spawnSync(process.execPath, [BIN, "ui"], NODE_OPTS);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/GUI not yet built/);
  });
});
```

- [ ] **Step 2: Build before running smoke test**

Run: `pnpm -F cairndex build`
Expected: `dist/bin.cjs` exists.

- [ ] **Step 3: Run test**

Run: `pnpm test bin.test`
Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli
git commit -m "test(cli): add bin smoke tests for help, version, ui"
```

---

## Task 8: Coverage and Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: all tests across `packages/core` + `packages/cli` pass.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: both `packages/core/dist` and `packages/cli/dist` produced.

- [ ] **Step 5: Run coverage**

Run: `pnpm vitest run --coverage`
Expected: `packages/cli/src` ≥ 70%, `packages/core/src` still ≥ 80%.

- [ ] **Step 6: End-to-end manual verification (optional but recommended)**

```bash
# scratch dir
mkdir /tmp/cairn-e2e && cd /tmp/cairn-e2e && git init
node <repo>/packages/cli/bin/cairndex init --cwd .
test -f .cairndex/index.md           # exists
test -f .cairndex/rules/operating-rules.md   # copied from bundled templates
test -f CLAUDE.md                    # has cairndex block
node <repo>/packages/cli/bin/cairndex doctor   # exits 0 (clean vault)
```

- [ ] **Step 7: Commit any final adjustments**

```bash
git status
# if any changes from manual verification, commit them.
git commit -am "chore(cli): final adjustments from end-to-end verification"
```

---

## Plan 3 Done — Acceptance

After all tasks complete:

1. `pnpm test` — all `core` + `cli` tests pass
2. `pnpm typecheck` — clean
3. `pnpm lint` — clean
4. `pnpm build` — both `core/dist` and `cli/dist` exist
5. Coverage: `core/src` ≥ 80%, `cli/src` ≥ 70%
6. The `cairndex` binary works end-to-end:
   - `cairndex --help` lists 4 commands + `insight` subcommand group
   - `cairndex init` creates a working vault, registers it globally, integrates `CLAUDE.md`, writes Claude Code hooks
   - `cairndex doctor` validates a vault; `--fix` resolves fixable issues; `--filter-path` scopes; `--auto-session` writes a session note
   - `cairndex sync` performs three-way merge against `~/.cairndex/shared/`
   - `cairndex insight promote/pull` round-trips between project and global
   - `cairndex ui` prints the Plan 4 stub message
7. Hooks installed by `init` actually invoke `cairndex doctor` correctly when an agent edits `.cairndex/**` and when the session ends

---

## Out of Scope (Plan 3)

- The actual GUI — Plan 4 replaces the `ui` stub.
- Authentication, encryption, multi-user — out of MVP entirely.
- Interactive prompts beyond minimal yes/no (richer wizards: v0.2).
- `cairndex config set <key> <value>` CLI sugar: v0.2.
