# cairndex Plan 2 — Core Workflow Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cross-cutting workflow modules to `packages/core` that depend on Plan 1 primitives: registry, idempotent CLAUDE.md merge, three-way sync, auto-session capture, file watcher, auto-fix engine, and the remaining 3 validate rules.

**Architecture:** Each module is a standalone file under `packages/core/src/` (or `src/validate/rules/`), depending only on Plan 1 modules and minimal new deps (`chokidar` for the watcher; no diff library — three-way merge is a hash-compare).

**Tech Stack:** Same as Plan 1 + `chokidar` (file watcher).

**Spec:** `docs/superpowers/specs/2026-04-30-cairndex-design.md` §5, §6, §10.

**Working directory:** `C:\Users\lvbab\Documents\GitHub\Cairndex`

**Prerequisites:** Plan 1 merged. `pnpm test` green. `@cairndex/core` exports listed in Plan 1 Task 14 step 2 are all present.

---

## File Structure (additions to `packages/core`)

```
packages/core/src/
  registry.ts                 ← Task 1: ~/.cairndex/projects.json
  claudeMd.ts                 ← Task 2: idempotent CLAUDE.md merge
  hash.ts                     ← Task 3: shared sha-256 helper
  sync.ts                     ← Task 3: three-way merge
  autoSession.ts              ← Task 4: Stop hook session generator
  watcher.ts                  ← Task 5: chokidar wrapper
  validate/
    fix.ts                    ← Task 6: auto-fix engine
    rules/
      phase-coherence.ts      ← Task 7
      unknown-folder.ts       ← Task 7
      confidence-low.ts       ← Task 7
  index.ts                    ← updated each task

packages/core/tests/
  registry.test.ts
  claudeMd.test.ts
  sync.test.ts
  autoSession.test.ts
  watcher.test.ts
  fix.test.ts
  validate-extra.test.ts
```

---

## Task 1: Registry Module

**Files:**
- Create: `packages/core/src/registry.ts`
- Create: `packages/core/tests/registry.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerProject,
  unregisterProject,
  listProjects,
  touchProject,
  globalDir,
} from "../src/registry.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cairn-home-"));
  process.env.CAIRNDEX_HOME = home;
});
afterEach(() => {
  delete process.env.CAIRNDEX_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("registry", () => {
  it("returns empty list when registry file missing", async () => {
    expect(await listProjects()).toEqual([]);
  });

  it("registers a project and persists", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]?.path).toBe("/tmp/repo-a");
    expect(list[0]?.alias).toBe("a");
    expect(list[0]?.registered_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // file actually exists on disk
    expect(existsSync(join(globalDir(), "projects.json"))).toBe(true);
  });

  it("dedupes by path on re-register; preserves alias", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    await registerProject({ path: "/tmp/repo-a", alias: "renamed" });
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]?.alias).toBe("renamed");
  });

  it("unregisters by path", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    await registerProject({ path: "/tmp/repo-b", alias: "b" });
    await unregisterProject("/tmp/repo-a");
    const list = await listProjects();
    expect(list.map((p) => p.alias)).toEqual(["b"]);
  });

  it("touchProject updates last_opened", async () => {
    await registerProject({ path: "/tmp/repo-a", alias: "a" });
    const before = (await listProjects())[0];
    await new Promise((r) => setTimeout(r, 5));
    await touchProject("/tmp/repo-a");
    const after = (await listProjects())[0];
    expect(after?.last_opened).toBeTruthy();
    expect(after?.last_opened).not.toBe(before?.last_opened);
  });

  it("respects CAIRNDEX_HOME env var", () => {
    expect(globalDir()).toBe(home);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm test registry.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/core/src/registry.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProjectEntry {
  path: string;
  alias: string;
  registered_at: string;
  last_opened?: string;
}

const REGISTRY_FILE = "projects.json";
const SHARED_DIR = "shared";

export function globalDir(): string {
  return process.env.CAIRNDEX_HOME ?? join(homedir(), ".cairndex");
}

export function sharedDir(): string {
  return join(globalDir(), SHARED_DIR);
}

function registryPath(): string {
  return join(globalDir(), REGISTRY_FILE);
}

async function readAll(): Promise<ProjectEntry[]> {
  const p = registryPath();
  if (!existsSync(p)) return [];
  const raw = await readFile(p, "utf8");
  try {
    const parsed = JSON.parse(raw) as { projects?: ProjectEntry[] };
    return parsed.projects ?? [];
  } catch {
    return [];
  }
}

async function writeAll(projects: ProjectEntry[]): Promise<void> {
  await mkdir(globalDir(), { recursive: true });
  await writeFile(registryPath(), JSON.stringify({ projects }, null, 2), "utf8");
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listProjects(): Promise<ProjectEntry[]> {
  return await readAll();
}

export async function registerProject(input: {
  path: string;
  alias: string;
}): Promise<ProjectEntry> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.path === input.path);
  const entry: ProjectEntry = {
    path: input.path,
    alias: input.alias,
    registered_at: idx >= 0 && all[idx]?.registered_at ? all[idx].registered_at : nowIso(),
    ...(idx >= 0 && all[idx]?.last_opened ? { last_opened: all[idx].last_opened } : {}),
  };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await writeAll(all);
  return entry;
}

export async function unregisterProject(path: string): Promise<void> {
  const all = await readAll();
  const next = all.filter((p) => p.path !== path);
  await writeAll(next);
}

export async function touchProject(path: string): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.path === path);
  if (idx < 0) return;
  const entry = all[idx];
  if (!entry) return;
  all[idx] = { ...entry, last_opened: nowIso() };
  await writeAll(all);
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

```ts
export * from "./registry.js";
```
(append to existing exports)

- [ ] **Step 5: Run test, expect pass**

Run: `pnpm test registry.test`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/registry.ts packages/core/src/index.ts packages/core/tests/registry.test.ts
git commit -m "feat(core): add ~/.cairndex/projects.json registry helpers"
```

---

## Task 2: CLAUDE.md Merge

**Files:**
- Create: `packages/core/src/claudeMd.ts`
- Create: `packages/core/tests/claudeMd.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { applyCairndexBlock, CAIRNDEX_BLOCK_START, CAIRNDEX_BLOCK_END } from "../src/claudeMd.js";

const BLOCK = "## cairndex Project Memory\n\n(content)\n";

describe("claudeMd", () => {
  it("creates new content when no CLAUDE.md exists", () => {
    const r = applyCairndexBlock(undefined, BLOCK);
    expect(r.action).toBe("created");
    expect(r.updated).toContain(CAIRNDEX_BLOCK_START);
    expect(r.updated).toContain(CAIRNDEX_BLOCK_END);
    expect(r.updated).toContain("## cairndex Project Memory");
  });

  it("appends to existing CLAUDE.md without markers", () => {
    const existing = "# My Project\n\nUser content.\n";
    const r = applyCairndexBlock(existing, BLOCK);
    expect(r.action).toBe("appended");
    expect(r.updated.startsWith("# My Project")).toBe(true);
    expect(r.updated).toContain(CAIRNDEX_BLOCK_START);
  });

  it("replaces content between existing markers", () => {
    const existing = `# My Project\n\nUser stuff.\n\n${CAIRNDEX_BLOCK_START}\nOLD CONTENT\n${CAIRNDEX_BLOCK_END}\n\nMore user.\n`;
    const r = applyCairndexBlock(existing, "NEW CONTENT\n");
    expect(r.action).toBe("replaced");
    expect(r.updated).toContain("NEW CONTENT");
    expect(r.updated).not.toContain("OLD CONTENT");
    expect(r.updated).toContain("More user.");
    expect(r.updated).toContain("User stuff.");
  });

  it("is idempotent: applying same block twice yields the same content", () => {
    const r1 = applyCairndexBlock("# X\n", BLOCK);
    const r2 = applyCairndexBlock(r1.updated, BLOCK);
    expect(r2.action).toBe("replaced");
    expect(r2.updated).toBe(r1.updated);
  });

  it("preserves user content outside markers exactly", () => {
    const existing = `before\n${CAIRNDEX_BLOCK_START}\nold\n${CAIRNDEX_BLOCK_END}\nafter\n`;
    const r = applyCairndexBlock(existing, "new\n");
    expect(r.updated).toBe(`before\n${CAIRNDEX_BLOCK_START}\nnew\n${CAIRNDEX_BLOCK_END}\nafter\n`);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test claudeMd.test`

- [ ] **Step 3: Write `packages/core/src/claudeMd.ts`**

```ts
export const CAIRNDEX_BLOCK_START = "<!-- cairndex:start v1 -->";
export const CAIRNDEX_BLOCK_END = "<!-- cairndex:end -->";

export type ApplyAction = "created" | "appended" | "replaced";

export interface ApplyResult {
  updated: string;
  action: ApplyAction;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : `${s}\n`;
}

export function applyCairndexBlock(
  existing: string | undefined,
  blockBody: string,
): ApplyResult {
  const body = ensureTrailingNewline(blockBody);
  const wrapped = `${CAIRNDEX_BLOCK_START}\n${body}${CAIRNDEX_BLOCK_END}\n`;

  if (existing === undefined || existing.trim().length === 0) {
    return { updated: wrapped, action: "created" };
  }

  const startIdx = existing.indexOf(CAIRNDEX_BLOCK_START);
  const endIdx = existing.indexOf(CAIRNDEX_BLOCK_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + CAIRNDEX_BLOCK_END.length);
    // Trim a single leading newline from `after` to avoid blank-line drift on idempotent runs.
    const afterTrimmed = after.startsWith("\n") ? after.slice(1) : after;
    return {
      updated: `${before}${CAIRNDEX_BLOCK_START}\n${body}${CAIRNDEX_BLOCK_END}\n${afterTrimmed}`,
      action: "replaced",
    };
  }

  const sep = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return {
    updated: `${existing}${sep}${wrapped}`,
    action: "appended",
  };
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./claudeMd.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test claudeMd.test`
Expected: 5 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/claudeMd.ts packages/core/src/index.ts packages/core/tests/claudeMd.test.ts
git commit -m "feat(core): add idempotent CLAUDE.md merge with cairndex markers"
```

---

## Task 3: Three-Way Sync (with hash helper)

**Files:**
- Create: `packages/core/src/hash.ts`
- Create: `packages/core/src/sync.ts`
- Create: `packages/core/tests/sync.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `hash.ts` test inline (small module, no separate test file)**

(Hash helper is exercised through sync tests; no separate unit test.)

- [ ] **Step 2: Write the failing sync test**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSync, writeSyncBaseline, readSyncBaseline } from "../src/sync.js";

let tmp: string;
let globalDir: string;
let projectDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-sync-"));
  globalDir = join(tmp, "global", "shared");
  projectDir = join(tmp, "project");
  mkdirSync(join(globalDir, "rules"), { recursive: true });
  mkdirSync(join(globalDir, "templates"), { recursive: true });
  mkdirSync(join(projectDir, ".cairndex", "rules"), { recursive: true });
  mkdirSync(join(projectDir, ".cairndex", "templates"), { recursive: true });
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeBoth(rel: string, content: string) {
  writeFileSync(join(globalDir, rel), content);
  writeFileSync(join(projectDir, ".cairndex", rel), content);
}

describe("sync", () => {
  it("no-ops when global, project, and baseline all match", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual([]);
    expect(r.skippedLocalEdits).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it("fast-forwards when only global changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(globalDir, "rules/operating-rules.md"), "v2\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual(["rules/operating-rules.md"]);
    expect(readFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "utf8")).toBe("v2\n");
    const baseline = await readSyncBaseline(projectDir);
    expect(baseline["rules/operating-rules.md"]).toBe("v2\n");
  });

  it("skips when only project changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "v1-local\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.skippedLocalEdits).toEqual(["rules/operating-rules.md"]);
    expect(r.fastForwarded).toEqual([]);
    expect(readFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "utf8")).toBe("v1-local\n");
  });

  it("writes conflict file when both changed", async () => {
    writeBoth("rules/operating-rules.md", "v1\n");
    await writeSyncBaseline(projectDir, { "rules/operating-rules.md": "v1\n" });
    writeFileSync(join(globalDir, "rules/operating-rules.md"), "v2-global\n");
    writeFileSync(join(projectDir, ".cairndex/rules/operating-rules.md"), "v2-local\n");
    const r = await runSync({ globalDir, projectDir });
    expect(r.conflicts).toEqual(["rules/operating-rules.md"]);
    const conflictPath = join(projectDir, ".cairndex/.sync-conflicts/rules/operating-rules.md");
    expect(existsSync(conflictPath)).toBe(true);
    const conflict = readFileSync(conflictPath, "utf8");
    expect(conflict).toContain("v2-global");
    expect(conflict).toContain("v2-local");
  });

  it("treats new-in-global file as fast-forward (creates locally)", async () => {
    writeFileSync(join(globalDir, "templates/new.md"), "fresh\n");
    await writeSyncBaseline(projectDir, {});
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded).toEqual(["templates/new.md"]);
    expect(existsSync(join(projectDir, ".cairndex/templates/new.md"))).toBe(true);
  });

  it("scans all tracked subdirs (rules + templates)", async () => {
    writeFileSync(join(globalDir, "rules/r.md"), "r\n");
    writeFileSync(join(globalDir, "templates/t.md"), "t\n");
    await writeSyncBaseline(projectDir, {});
    const r = await runSync({ globalDir, projectDir });
    expect(r.fastForwarded.sort()).toEqual(["rules/r.md", "templates/t.md"]);
  });
});
```

- [ ] **Step 3: Run, expect fail**

Run: `pnpm test sync.test`

- [ ] **Step 4: Write `packages/core/src/hash.ts`**

```ts
import { createHash } from "node:crypto";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
```

- [ ] **Step 5: Write `packages/core/src/sync.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { sha256 } from "./hash.js";

export interface SyncResult {
  fastForwarded: string[];
  skippedLocalEdits: string[];
  conflicts: string[];
}

export interface SyncInput {
  globalDir: string; // ~/.cairndex/shared
  projectDir: string; // <repo> (NOT <repo>/.cairndex)
}

const TRACKED_SUBDIRS = ["rules", "templates"] as const;
const BASELINE_FILE = ".cairndex/.sync-baseline.json";
const CONFLICTS_DIR = ".cairndex/.sync-conflicts";

async function listMarkdownRel(dir: string, base: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".md")) {
        out.push(relative(base, full).replace(/\\/g, "/"));
      }
    }
  }
  return out;
}

async function readMaybe(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return await readFile(path, "utf8");
}

export async function readSyncBaseline(projectDir: string): Promise<Record<string, string>> {
  const p = join(projectDir, BASELINE_FILE);
  if (!existsSync(p)) return {};
  const raw = await readFile(p, "utf8");
  try {
    const data = JSON.parse(raw) as { hashes?: Record<string, string> };
    return data.hashes ?? {};
  } catch {
    return {};
  }
}

export async function writeSyncBaseline(
  projectDir: string,
  contents: Record<string, string>,
): Promise<void> {
  const hashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(contents)) hashes[k] = sha256(v);
  const p = join(projectDir, BASELINE_FILE);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ hashes }, null, 2), "utf8");
}

async function updateBaselineEntry(
  projectDir: string,
  rel: string,
  content: string,
): Promise<void> {
  const baseline = await readSyncBaseline(projectDir);
  baseline[rel] = sha256(content);
  const p = join(projectDir, BASELINE_FILE);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ hashes: baseline }, null, 2), "utf8");
}

export async function runSync(input: SyncInput): Promise<SyncResult> {
  const { globalDir, projectDir } = input;
  const projectVault = join(projectDir, ".cairndex");

  // Collect candidate files from both sides under tracked subdirs.
  const candidates = new Set<string>();
  for (const sub of TRACKED_SUBDIRS) {
    for (const f of await listMarkdownRel(join(globalDir, sub), globalDir)) candidates.add(f);
    for (const f of await listMarkdownRel(join(projectVault, sub), projectVault)) candidates.add(f);
  }

  const baseline = await readSyncBaseline(projectDir);
  const result: SyncResult = { fastForwarded: [], skippedLocalEdits: [], conflicts: [] };

  for (const rel of candidates) {
    const globalPath = join(globalDir, rel);
    const projectPath = join(projectVault, rel);
    const globalContent = await readMaybe(globalPath);
    const projectContent = await readMaybe(projectPath);
    const baseHash = baseline[rel];

    const globalHash = globalContent != null ? sha256(globalContent) : null;
    const projectHash = projectContent != null ? sha256(projectContent) : null;

    const globalChanged = globalHash !== baseHash;
    const projectChanged = projectHash !== baseHash;

    if (!globalChanged && !projectChanged) continue;

    if (globalChanged && !projectChanged) {
      // fast-forward
      if (globalContent != null) {
        await mkdir(dirname(projectPath), { recursive: true });
        await writeFile(projectPath, globalContent, "utf8");
        await updateBaselineEntry(projectDir, rel, globalContent);
      }
      result.fastForwarded.push(rel);
      continue;
    }

    if (!globalChanged && projectChanged) {
      result.skippedLocalEdits.push(rel);
      continue;
    }

    // both changed → conflict
    const conflictPath = join(projectDir, CONFLICTS_DIR, rel);
    await mkdir(dirname(conflictPath), { recursive: true });
    const body =
      `<!-- cairndex sync conflict for ${rel} -->\n\n` +
      `## <<<<<<< global (~/.cairndex/shared/${rel})\n` +
      (globalContent ?? "(missing)\n") +
      `\n## =======\n` +
      (projectContent ?? "(missing)\n") +
      `\n## >>>>>>> project (${rel})\n`;
    await writeFile(conflictPath, body, "utf8");
    result.conflicts.push(rel);
  }

  return result;
}
```

- [ ] **Step 6: Update index**

```ts
export * from "./hash.js";
export * from "./sync.js";
```

- [ ] **Step 7: Run test**

Run: `pnpm test sync.test`
Expected: 6 PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/hash.ts packages/core/src/sync.ts packages/core/src/index.ts packages/core/tests/sync.test.ts
git commit -m "feat(core): add three-way sync between global shared/ and project vault"
```

---

## Task 4: Auto-Session Generator

**Files:**
- Create: `packages/core/src/autoSession.ts`
- Create: `packages/core/tests/autoSession.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateAutoSession } from "../src/autoSession.js";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-as-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/sessions"), { recursive: true });
  writeFileSync(
    join(tmp, ".cairndex/specs/SPEC-001-x.md"),
    "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
  );
  writeFileSync(
    join(tmp, ".cairndex/decisions/ADR-005-y.md"),
    "---\nid: ADR-005\ntitle: Y\nstatus: accepted\ncreated: 2026-04-30\n---\n",
  );
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("autoSession", () => {
  it("generates a session file with touches links from a transcript", async () => {
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [
        ".cairndex/specs/SPEC-001-x.md",
        ".cairndex/decisions/ADR-005-y.md",
        "src/auth/login.ts",
      ],
      summary: "",
    });
    expect(result.id).toBe("2026-04-30-1530");
    expect(existsSync(result.path)).toBe(true);
    const raw = readFileSync(result.path, "utf8");
    const parsed = parseFrontmatter(raw);
    const fm = parsed.data as { id: string; date: string; links: { type: string; target: string }[] };
    expect(fm.id).toBe("2026-04-30-1530");
    expect(fm.date).toBe("2026-04-30");
    expect(fm.links).toContainEqual({ type: "touches", target: "SPEC-001" });
    expect(fm.links).toContainEqual({ type: "touches", target: "ADR-005" });
    expect(parsed.content).toMatch(/SPEC-001/);
  });

  it("avoids overwriting an existing session file by suffixing", async () => {
    const existing = join(tmp, ".cairndex/sessions/2026-04-30-1530.md");
    writeFileSync(existing, "---\nid: 2026-04-30-1530\ndate: 2026-04-30\nsummary: pre-existing\n---\n");
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [],
      summary: "",
    });
    expect(result.path).not.toBe(existing);
    expect(result.path).toMatch(/2026-04-30-1530-1\.md$/);
    expect(readFileSync(existing, "utf8")).toContain("pre-existing");
  });

  it("works with no touched paths (empty links array)", async () => {
    const result = await generateAutoSession({
      repoRoot: tmp,
      cfg: defaultConfig(),
      now: new Date("2026-04-30T15:30:00Z"),
      touchedPaths: [],
      summary: "",
    });
    const raw = readFileSync(result.path, "utf8");
    const fm = parseFrontmatter(raw).data as { links: unknown[] };
    expect(fm.links).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test autoSession.test`

- [ ] **Step 3: Write `packages/core/src/autoSession.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType } from "./config.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { formatSessionId, parseId } from "./ids.js";
import { nodeFolderPath } from "./paths.js";

export interface GenerateAutoSessionInput {
  repoRoot: string;
  cfg: Config;
  now: Date;
  touchedPaths: readonly string[];
  summary?: string;
  agentName?: string;
}

export interface GenerateAutoSessionResult {
  id: string;
  path: string;
}

const ID_RE = /([A-Z]+-\d+|\d{4}-\d{2}-\d{2}-\d{4})/g;

function extractIdsFromPath(p: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  ID_RE.lastIndex = 0;
  while ((m = ID_RE.exec(p)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export async function generateAutoSession(
  input: GenerateAutoSessionInput,
): Promise<GenerateAutoSessionResult> {
  const id = formatSessionId(input.now, { utc: true });
  const date = id.slice(0, 10);

  // Collect touched IDs (sequential SPEC/ADR/etc. or session-format).
  const ids = new Set<string>();
  for (const p of input.touchedPaths) {
    for (const found of extractIdsFromPath(p)) {
      // skip session-format IDs as touch targets
      if (parseId(found)) ids.add(found);
    }
  }

  const links = Array.from(ids).map((target) => ({ type: "touches", target }));

  const frontmatter = {
    id,
    date,
    summary: input.summary ?? "TODO: one-line summary",
    provenance: {
      created_by: input.agentName ?? "cairndex-auto-session",
      session: id,
    },
    links,
  };

  const touchedList = input.touchedPaths.length
    ? input.touchedPaths.map((p) => `- ${basename(p)} (\`${p}\`)`).join("\n")
    : "- (no .cairndex files touched)";

  const idsList = links.length
    ? links.map((l) => `- [[${l.target}]]`).join("\n")
    : "- (none)";

  const body = [
    "## What I did",
    "",
    "(TODO: describe the work in 1–3 bullets.)",
    "",
    "## Files touched",
    "",
    touchedList,
    "",
    "## Nodes referenced",
    "",
    idsList,
    "",
    "## Next",
    "",
    "(TODO: one-line next action.)",
  ].join("\n");

  const folder = nodeFolderPath(input.repoRoot, folderForNodeType(input.cfg, "session"));
  await mkdir(folder, { recursive: true });

  let suffix = 0;
  let outputPath = join(folder, `${id}.md`);
  while (existsSync(outputPath)) {
    suffix += 1;
    outputPath = join(folder, `${id}-${suffix}.md`);
  }

  await writeFile(outputPath, serializeFrontmatter(frontmatter, `\n${body}\n`), "utf8");

  return { id, path: outputPath };
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./autoSession.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test autoSession.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/autoSession.ts packages/core/src/index.ts packages/core/tests/autoSession.test.ts
git commit -m "feat(core): add Stop-hook auto session note generator"
```

---

## Task 5: File Watcher (chokidar wrapper)

**Files:**
- Create: `packages/core/src/watcher.ts`
- Create: `packages/core/tests/watcher.test.ts`
- Add dep: `chokidar`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add dependency**

Run: `pnpm -F @cairndex/core add chokidar`

- [ ] **Step 2: Write the failing test**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWatcher } from "../src/watcher.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-watch-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

async function wait(ms: number) { await new Promise((r) => setTimeout(r, ms)); }

describe("watcher", () => {
  it("emits change events when a tracked file is written", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 50,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    writeFileSync(
      join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    );
    await wait(300);
    await watcher.stop();
    expect(events.some((p) => p.endsWith("SPEC-001-x.md"))).toBe(true);
  });

  it("debounces rapid writes to the same file", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 100,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    const f = join(tmp, ".cairndex/specs/SPEC-002-y.md");
    for (let i = 0; i < 5; i++) {
      writeFileSync(f, `# v${i}\n`);
      await wait(20);
    }
    await wait(250);
    await watcher.stop();
    const matching = events.filter((p) => p.endsWith("SPEC-002-y.md"));
    // 5 writes within 100ms debounce should collapse — exact count platform-dependent
    expect(matching.length).toBeLessThanOrEqual(2);
  });

  it("ignores files outside .cairndex/", async () => {
    const events: string[] = [];
    const watcher = createWatcher({
      repoRoot: tmp,
      cfg: defaultConfig(),
      debounceMs: 50,
      onChange: (path) => events.push(path),
    });
    await watcher.start();
    writeFileSync(join(tmp, "outside.md"), "x\n");
    await wait(200);
    await watcher.stop();
    expect(events.filter((p) => p.includes("outside.md"))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect fail**

Run: `pnpm test watcher.test`

- [ ] **Step 4: Write `packages/core/src/watcher.ts`**

```ts
import chokidar, { type FSWatcher } from "chokidar";
import { join } from "node:path";
import type { Config } from "./config.js";
import { vaultPath } from "./paths.js";

export interface WatcherInput {
  repoRoot: string;
  cfg: Config;
  debounceMs?: number;
  onChange?: (path: string) => void | Promise<void>;
  onAdd?: (path: string) => void | Promise<void>;
  onUnlink?: (path: string) => void | Promise<void>;
  onRename?: (oldPath: string, newPath: string) => void | Promise<void>;
}

export interface Watcher {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWatcher(input: WatcherInput): Watcher {
  const debounceMs = input.debounceMs ?? 250;
  const debounce = new Map<string, NodeJS.Timeout>();
  let fsw: FSWatcher | null = null;

  function fire(path: string, fn: ((p: string) => void | Promise<void>) | undefined) {
    if (!fn) return;
    const key = `${fn.name}:${path}`;
    const prev = debounce.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      debounce.delete(key);
      void fn(path);
    }, debounceMs);
    debounce.set(key, t);
  }

  return {
    async start() {
      if (fsw) return;
      const root = vaultPath(input.repoRoot);
      fsw = chokidar.watch(root, {
        ignored: [/(^|[\\/])\.sync-conflicts/, /(^|[\\/])\.sync-baseline\.json$/],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
      });
      fsw.on("add", (p) => fire(p, input.onAdd));
      fsw.on("change", (p) => fire(p, input.onChange));
      fsw.on("unlink", (p) => fire(p, input.onUnlink));
      // chokidar does not natively emit rename; consumers detect via add+unlink within a window.
      await new Promise<void>((resolve, reject) => {
        if (!fsw) return resolve();
        fsw.once("ready", () => resolve());
        fsw.once("error", reject);
      });
      // Reference unused to silence linter
      void join;
    },
    async stop() {
      if (!fsw) return;
      for (const t of debounce.values()) clearTimeout(t);
      debounce.clear();
      await fsw.close();
      fsw = null;
    },
  };
}
```

- [ ] **Step 5: Update index**

```ts
export * from "./watcher.js";
```

- [ ] **Step 6: Run test**

Run: `pnpm test watcher.test`
Expected: 3 PASS. (Note: file-watcher tests can be flaky on Windows; if they fail intermittently, increase wait times to 500ms; the third test is the most reliable.)

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/watcher.ts packages/core/src/index.ts packages/core/tests/watcher.test.ts pnpm-lock.yaml packages/core/package.json
git commit -m "feat(core): add chokidar-based file watcher with debounced events"
```

---

## Task 6: Auto-Fix Engine

**Files:**
- Create: `packages/core/src/validate/fix.ts`
- Create: `packages/core/tests/fix.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyAutoFixes } from "../src/validate/fix.js";
import { runValidation } from "../src/validate/index.js";
import { defaultConfig } from "../src/config.js";
import { parseFrontmatter } from "../src/frontmatter.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-fix-"));
  mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
  mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("auto-fix", () => {
  it("normalizes non-kebab-case tags on disk", async () => {
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(f,
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ntags: [\"Foo Bar\", \"BAZ\"]\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    const r = await applyAutoFixes(tmp, defaultConfig(), issues);
    expect(r.fixed.some((i) => i.rule === "tag-format")).toBe(true);
    const after = parseFrontmatter(readFileSync(f, "utf8")).data as { tags: string[] };
    expect(after.tags).toEqual(["foo-bar", "baz"]);
  });

  it("adds reciprocal superseded_by link to target ADR", async () => {
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-001-old.md"),
      "---\nid: ADR-001\ntitle: Old\nstatus: superseded\ncreated: 2026-04-01\n---\n");
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-002-new.md"),
      "---\nid: ADR-002\ntitle: New\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: supersedes, target: ADR-001 }\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "bidirectional")).toBe(true);
    await applyAutoFixes(tmp, defaultConfig(), issues);
    const after = parseFrontmatter(readFileSync(join(tmp, ".cairndex/decisions/ADR-001-old.md"), "utf8")).data as { links: { type: string; target: string }[] };
    expect(after.links).toContainEqual({ type: "superseded_by", target: "ADR-002" });
  });

  it("returns separate lists of fixed and unfixed issues", async () => {
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    // missing verification — not fixable
    const issues = await runValidation(tmp, defaultConfig());
    const r = await applyAutoFixes(tmp, defaultConfig(), issues);
    expect(r.unfixed.some((i) => i.rule === "verification-bound")).toBe(true);
    expect(r.fixed.find((i) => i.rule === "verification-bound")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test fix.test`

- [ ] **Step 3: Write `packages/core/src/validate/fix.ts`**

```ts
import { readFile, writeFile } from "node:fs/promises";
import type { Config } from "../config.js";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { normalizeFrontmatter, normalizeTags } from "../normalize.js";
import type { ValidationIssue } from "./types.js";

const RECIPROCALS: Record<string, string> = {
  supersedes: "superseded_by",
  superseded_by: "supersedes",
  blocks: "blocked_by",
  blocked_by: "blocks",
};

interface LinkLike { type: string; target: string }

export interface FixResult {
  fixed: ValidationIssue[];
  unfixed: ValidationIssue[];
}

async function rewriteFile(
  path: string,
  fn: (fm: Record<string, unknown>, body: string) => Record<string, unknown>,
): Promise<void> {
  const raw = await readFile(path, "utf8");
  const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
  const next = fn(data, content);
  await writeFile(path, serializeFrontmatter(next, content), "utf8");
}

export async function applyAutoFixes(
  _repoRoot: string,
  _cfg: Config,
  issues: readonly ValidationIssue[],
): Promise<FixResult> {
  const fixed: ValidationIssue[] = [];
  const unfixed: ValidationIssue[] = [];

  // Group by path for efficient rewrite.
  const byPath = new Map<string, ValidationIssue[]>();
  for (const i of issues) {
    if (!i.fixable || !i.path) {
      unfixed.push(i);
      continue;
    }
    const list = byPath.get(i.path) ?? [];
    list.push(i);
    byPath.set(i.path, list);
  }

  for (const [path, list] of byPath) {
    try {
      await rewriteFile(path, (fm) => {
        let next = { ...fm };
        for (const i of list) {
          if (i.rule === "tag-format") {
            next.tags = normalizeTags(next.tags);
          }
          // bidirectional fixes are handled below (touch target file)
        }
        return normalizeFrontmatter(next, { refreshTimestamp: true });
      });
      for (const i of list) if (i.rule !== "bidirectional" && i.rule !== "id-consistency") fixed.push(i);
    } catch {
      for (const i of list) unfixed.push(i);
    }
  }

  // Handle bidirectional separately: write the reciprocal on the target file.
  for (const i of issues) {
    if (i.rule !== "bidirectional" || !i.fixable) continue;
    // Parse message: "${node.id}.${link.type} -> ${link.target}, but ${link.target}.${reciprocal} -> ${node.id} is missing"
    const m = /^(.+?)\.(\w+) -> (.+?), but (.+?)\.(\w+) -> (.+?) is missing$/.exec(i.message);
    if (!m) { unfixed.push(i); continue; }
    const [, fromId, _fromType, , targetId, reciprocal, sourceId] = m;
    if (!targetId || !reciprocal || !sourceId) { unfixed.push(i); continue; }
    // Find target file: scan all known nodes... simplest: rely on caller having `i.path` for SOURCE; we need target's path.
    // Workaround: search the validation context indirectly via re-parsing all node files.
    // For Plan 2 MVP: we re-derive target path by scanning the vault directory tree for a file containing `id: ${targetId}`.
    try {
      const targetPath = await findFileByFrontmatterId(_repoRoot, targetId);
      if (!targetPath) { unfixed.push(i); continue; }
      await rewriteFile(targetPath, (fm) => {
        const links = (Array.isArray(fm.links) ? fm.links : []) as LinkLike[];
        const exists = links.some((l) => l.type === reciprocal && l.target === sourceId);
        if (!exists) links.push({ type: reciprocal, target: sourceId });
        return { ...fm, links };
      });
      fixed.push(i);
    } catch {
      unfixed.push(i);
    }
    void fromId; // silence unused
  }

  // id-consistency: for now, leave to manual fix (file rename is risky in auto mode).
  for (const i of issues) {
    if (i.rule === "id-consistency" && i.fixable) unfixed.push(i);
  }

  return { fixed, unfixed };
}

async function findFileByFrontmatterId(
  repoRoot: string,
  id: string,
): Promise<string | null> {
  const { listNodeFiles } = await import("../vault.js");
  const { defaultConfig } = await import("../config.js");
  const { NODE_TYPES } = await import("../types.js");
  const cfg = defaultConfig();
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) if (f.id === id) return f.path;
  }
  return null;
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./validate/fix.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test fix.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validate/fix.ts packages/core/src/index.ts packages/core/tests/fix.test.ts
git commit -m "feat(core): add auto-fix engine for fixable validation issues"
```

---

## Task 7: Remaining Validate Rules

**Files:**
- Create: `packages/core/src/validate/rules/phase-coherence.ts`
- Create: `packages/core/src/validate/rules/unknown-folder.ts`
- Create: `packages/core/src/validate/rules/confidence-low.ts`
- Create: `packages/core/tests/validate-extra.test.ts`
- Modify: `packages/core/src/validate/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runValidation } from "../src/validate/index.js";
import { phaseCoherence } from "../src/validate/rules/phase-coherence.js";
import { unknownFolder } from "../src/validate/rules/unknown-folder.js";
import { confidenceLow } from "../src/validate/rules/confidence-low.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cairn-vex-"));
  mkdirSync(join(tmp, ".cairndex"), { recursive: true });
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("validate extra rules", () => {
  it("phase-coherence warns when phase is implementing but plans/ is empty", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/index.md"),
      "---\nphase: implementing\n---\n# index\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [phaseCoherence] });
    expect(issues.some((i) => i.rule === "phase-coherence" && i.severity === "warn")).toBe(true);
  });

  it("phase-coherence does not warn when phase is implementing and plans/ has files", async () => {
    mkdirSync(join(tmp, ".cairndex/plans"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/plans/PLAN-001.md"),
      "---\nid: PLAN-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    writeFileSync(join(tmp, ".cairndex/index.md"),
      "---\nphase: implementing\n---\n# index\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [phaseCoherence] });
    expect(issues.filter((i) => i.rule === "phase-coherence")).toEqual([]);
  });

  it("unknown-folder warns on a folder not in config", async () => {
    mkdirSync(join(tmp, ".cairndex/experiments"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/experiments/X-001.md"),
      "---\nid: X-001\ntitle: x\n---\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [unknownFolder] });
    expect(issues.some((i) => i.rule === "unknown-folder")).toBe(true);
  });

  it("unknown-folder does not warn on archive/ or templates/ or rules/", async () => {
    mkdirSync(join(tmp, ".cairndex/archive"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/rules"), { recursive: true });
    const issues = await runValidation(tmp, defaultConfig(), { rules: [unknownFolder] });
    expect(issues.filter((i) => i.rule === "unknown-folder")).toEqual([]);
  });

  it("confidence-low emits info on low-confidence node referenced by an active spec", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nlinks:\n  - { type: implements, target: ADR-001 }\n---\n");
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: accepted\ncreated: 2026-04-30\nprovenance:\n  created_by: c\n  session: s\n  confidence: 0.3\n---\n");
    const issues = await runValidation(tmp, defaultConfig(), { rules: [confidenceLow] });
    expect(issues.some((i) => i.rule === "confidence-low" && i.nodeId === "ADR-001")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test validate-extra.test`

- [ ] **Step 3: Write `phase-coherence.ts`**

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidationRule } from "../types.js";
import { parseFrontmatter } from "../../frontmatter.js";
import { vaultPath } from "../../paths.js";

export const phaseCoherence: ValidationRule = {
  name: "phase-coherence",
  run(ctx) {
    const indexPath = join(vaultPath(ctx.repoRoot), "index.md");
    if (!existsSync(indexPath)) return [];
    const raw = readFileSync(indexPath, "utf8");
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);
    const phase = String(data.phase ?? "");
    if (phase !== "implementing") return [];

    const plansDir = join(vaultPath(ctx.repoRoot), "plans");
    const hasPlans =
      existsSync(plansDir) &&
      readdirSync(plansDir).some((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
    if (hasPlans) return [];

    return [{
      rule: "phase-coherence",
      severity: "warn" as const,
      message: "index.md says phase: implementing but plans/ has no plan files",
      path: indexPath,
      fixable: false,
    }];
  },
};
```

- [ ] **Step 4: Write `unknown-folder.ts`**

```ts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ValidationRule } from "../types.js";
import { vaultPath } from "../../paths.js";

const ALLOWED_EXTRA = new Set([
  "archive",
  "templates",
  "rules",
  "context",
  ".sync-conflicts",
]);

const KNOWN_NODE_FOLDERS = new Set([
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
]);

export const unknownFolder: ValidationRule = {
  name: "unknown-folder",
  run(ctx) {
    const root = vaultPath(ctx.repoRoot);
    if (!existsSync(root)) return [];
    const entries = readdirSync(root, { withFileTypes: true });
    const issues = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (ALLOWED_EXTRA.has(e.name) || KNOWN_NODE_FOLDERS.has(e.name)) continue;
      issues.push({
        rule: "unknown-folder",
        severity: "warn" as const,
        message: `unknown folder under .cairndex/: ${e.name}`,
        path: join(root, e.name),
        fixable: false,
      });
    }
    return issues;
  },
};
```

- [ ] **Step 5: Write `confidence-low.ts`**

```ts
import type { ValidationRule } from "../types.js";

interface LinkLike { type: string; target: string }

const LOW_THRESHOLD = 0.5;

export const confidenceLow: ValidationRule = {
  name: "confidence-low",
  run(ctx) {
    const byId = new Map(ctx.allNodes.map((n) => [n.id, n] as const));
    const referencedByActive = new Set<string>();
    for (const node of ctx.allNodes) {
      if ((node.type !== "spec" && node.type !== "plan") || node.frontmatter.status !== "active") continue;
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const l of links) if (l?.target) referencedByActive.add(l.target);
    }
    const issues = [];
    for (const id of referencedByActive) {
      const target = byId.get(id);
      if (!target) continue;
      const prov = target.frontmatter.provenance as { confidence?: number } | undefined;
      if (typeof prov?.confidence === "number" && prov.confidence < LOW_THRESHOLD) {
        issues.push({
          rule: "confidence-low",
          severity: "info" as const,
          message: `${id} referenced by an active node has low confidence: ${prov.confidence}`,
          nodeType: target.type,
          nodeId: id,
          path: target.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
```

- [ ] **Step 6: Register the new rules in `validate/index.ts`**

Append to the imports and `RULES` array:

```ts
import { phaseCoherence } from "./rules/phase-coherence.js";
import { unknownFolder } from "./rules/unknown-folder.js";
import { confidenceLow } from "./rules/confidence-low.js";

const RULES: ValidationRule[] = [
  schemaRequired,
  idConsistency,
  referenceIntegrity,
  verificationBound,
  bidirectional,
  idCollision,
  provenancePresent,
  freshness,
  tagFormat,
  phaseCoherence,
  unknownFolder,
  confidenceLow,
];
```

- [ ] **Step 7: Run tests**

Run: `pnpm test validate-extra.test && pnpm test validate.test`
Expected: All PASS — old + new tests both green.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/validate/rules/phase-coherence.ts packages/core/src/validate/rules/unknown-folder.ts packages/core/src/validate/rules/confidence-low.ts packages/core/src/validate/index.ts packages/core/tests/validate-extra.test.ts
git commit -m "feat(core): add phase-coherence, unknown-folder, confidence-low validation rules"
```

---

## Task 8: API Surface Update + Coverage Gate

**Files:**
- Modify: `packages/core/tests/api-surface.test.ts`

- [ ] **Step 1: Extend the api-surface test**

Add to the `expected` array in `tests/api-surface.test.ts`:

```ts
"globalDir",
"sharedDir",
"listProjects",
"registerProject",
"unregisterProject",
"touchProject",
"applyCairndexBlock",
"CAIRNDEX_BLOCK_START",
"CAIRNDEX_BLOCK_END",
"sha256",
"runSync",
"writeSyncBaseline",
"readSyncBaseline",
"generateAutoSession",
"createWatcher",
"applyAutoFixes",
```

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: every test file passes.

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Run coverage**

Run: `pnpm vitest run --coverage`
Expected: `packages/core/src` coverage ≥ 80%.

- [ ] **Step 5: Run build**

Run: `pnpm build`
Expected: dist outputs include the new modules.

- [ ] **Step 6: Commit**

```bash
git add packages/core/tests/api-surface.test.ts
git commit -m "test(core): expand api surface guard for Plan 2 additions"
```

---

## Plan 2 Done — Acceptance

After all tasks complete:

1. `pnpm test` — all tests pass (Plan 1 + Plan 2)
2. `pnpm typecheck` — clean
3. `pnpm lint` — clean
4. `pnpm build` — dist outputs present
5. `packages/core/src` coverage ≥ 80%
6. New public exports listed in Task 8 step 1 are all present
7. The library now exposes everything Plan 3 (CLI) needs:
   - registry (init/projects)
   - claudeMd (init)
   - sync (sync command)
   - autoSession (Stop hook)
   - watcher (ui command)
   - validate.fix (doctor --fix)
   - all 12 validate rules (doctor)

---

## Out of Scope (Plan 2)

- The CLI commands themselves — Plan 3.
- The server and web GUI — Plan 4.
- File-rename detection (chokidar emits add+unlink; rename heuristic deferred to Plan 3 hook layer).
- MCP server, embeddings — out of MVP entirely.
