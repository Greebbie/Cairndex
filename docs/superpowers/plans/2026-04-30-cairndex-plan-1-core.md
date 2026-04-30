# cairndex Plan 1 — Core Foundation Library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/core` — the TypeScript library that reads, writes, validates, and maintains a cairndex Markdown vault. Other plans (CLI, server, web) consume this library.

**Architecture:** Pure-TS library, no I/O outside `node:fs/promises` and `node:path`. Each module has one responsibility. Public API is exposed from `packages/core/src/index.ts`. All modules typed with zod-derived types. No globals, no side effects at import time.

**Tech Stack:** TypeScript 5.x, Node 20+, pnpm workspaces, zod (schema), gray-matter (frontmatter), tsup (build), vitest (test), biome (lint).

**Spec:** `docs/superpowers/specs/2026-04-30-cairndex-design.md` — refer to §2, §3, §4, §5, §6, §10, §11 throughout.

**Working directory:** `C:\Users\lvbab\Documents\GitHub\Cairndex`

---

## File Structure

```
cairndex/                             ← repo root (already git-init'd, has docs/)
  package.json                        ← Task 1: workspace root
  pnpm-workspace.yaml                 ← Task 1
  tsconfig.base.json                  ← Task 1
  biome.json                          ← Task 1
  vitest.config.ts                    ← Task 1
  .gitignore                          ← Task 1
  .nvmrc                              ← Task 1
  packages/
    core/
      package.json                    ← Task 2
      tsconfig.json                   ← Task 2
      tsup.config.ts                  ← Task 2
      src/
        index.ts                      ← Task 2 (re-exports), updated each task
        types.ts                      ← Task 3 (NodeType enum, common types)
        schema.ts                     ← Task 3 (zod schemas)
        frontmatter.ts                ← Task 4 (parse/serialize)
        ids.ts                        ← Task 5 (parse/generate)
        config.ts                     ← Task 6 (load/merge)
        paths.ts                      ← Task 6 (path resolution helpers)
        vault.ts                      ← Task 7 (read/write/list)
        templates.ts                  ← Task 8 (load/render)
        normalize.ts                  ← Task 9 (auto-fix)
        validate/
          index.ts                    ← Task 10 (engine + rules registry)
          rules/
            schema-required.ts        ← Task 10
            id-consistency.ts         ← Task 10
            reference-integrity.ts    ← Task 10
            verification-bound.ts     ← Task 10
            bidirectional.ts          ← Task 10
            id-collision.ts           ← Task 10
            provenance-present.ts     ← Task 10
            freshness.ts              ← Task 10
            phase-coherence.ts        ← Task 10
            tag-format.ts             ← Task 10
            unknown-folder.ts         ← Task 10
            confidence-low.ts         ← Task 10
        backlinks.ts                  ← Task 11
        archive.ts                    ← Task 12
      tests/
        schema.test.ts                ← Task 3
        frontmatter.test.ts           ← Task 4
        ids.test.ts                   ← Task 5
        config.test.ts                ← Task 6
        vault.test.ts                 ← Task 7
        templates.test.ts             ← Task 8
        normalize.test.ts             ← Task 9
        validate.test.ts              ← Task 10
        backlinks.test.ts             ← Task 11
        archive.test.ts               ← Task 12
        fixtures/
          sample-vault/               ← Task 13 (realistic vault used by tests)
            ...
  templates/                          ← Task 13 (default shared/ shipped to users)
    rules/operating-rules.md
    templates/{spec,decision,plan,task,session,insight,question,change,goal,intent}.md
```

---

## Task 1: Initialize Monorepo Skeleton

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Verify Node version**

Run: `node --version`
Expected: `v20.x` or higher. If lower, install Node 20 via nvm/fnm before continuing.

- [ ] **Step 2: Verify pnpm installed**

Run: `pnpm --version`
Expected: `9.x` or higher. If absent: `npm i -g pnpm@latest`.

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write root `package.json`**

```json
{
  "name": "cairndex-monorepo",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 5: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 6: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 7: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "off" }
    }
  },
  "files": { "ignore": ["**/dist", "**/node_modules", "**/*.md"] }
}
```

- [ ] **Step 8: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/**/src/**"],
    },
  },
});
```

- [ ] **Step 9: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.tsbuildinfo
coverage/
.vitest/
```

- [ ] **Step 10: Install dev dependencies**

Run: `pnpm install`
Expected: `Lockfile is up to date`. Creates `pnpm-lock.yaml` and `node_modules/`.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json biome.json vitest.config.ts .gitignore .nvmrc pnpm-lock.yaml
git commit -m "chore: initialize monorepo skeleton with pnpm + biome + vitest"
```

---

## Task 2: Create `packages/core` Skeleton

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/.gitkeep`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@cairndex/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node20",
});
```

- [ ] **Step 4: Write `packages/core/src/index.ts` (placeholder, grows each task)**

```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 5: Touch `packages/core/tests/.gitkeep`**

```
```

- [ ] **Step 6: Install package deps**

Run: `pnpm install`
Expected: dependencies of `@cairndex/core` installed.

- [ ] **Step 7: Verify typecheck**

Run: `pnpm -F @cairndex/core typecheck`
Expected: no errors.

- [ ] **Step 8: Verify build**

Run: `pnpm -F @cairndex/core build`
Expected: `dist/index.js`, `dist/index.d.ts`, `dist/index.js.map` produced.

- [ ] **Step 9: Commit**

```bash
git add packages/core/ pnpm-lock.yaml
git commit -m "feat(core): scaffold @cairndex/core package"
```

---

## Task 3: Schema Module (zod schemas for all node types)

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/schema.ts`
- Create: `packages/core/tests/schema.test.ts`
- Modify: `packages/core/src/index.ts`

**Spec reference:** §3 "Memory Model", §4 "config.yaml schema".

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SpecFrontmatterSchema,
  DecisionFrontmatterSchema,
  SessionFrontmatterSchema,
  LinkSchema,
  ProvenanceSchema,
} from "../src/schema.js";

describe("schema", () => {
  it("accepts a minimal valid spec frontmatter", () => {
    const fm = {
      id: "SPEC-001",
      title: "User can log in",
      status: "active",
      created: "2026-04-30",
      updated: "2026-04-30",
    };
    expect(() => SpecFrontmatterSchema.parse(fm)).not.toThrow();
  });

  it("rejects spec with missing required field", () => {
    const fm = { id: "SPEC-001", title: "X", status: "active", created: "2026-04-30" };
    expect(() => SpecFrontmatterSchema.parse(fm)).toThrow();
  });

  it("validates a typed link", () => {
    const link = { type: "supersedes", target: "ADR-002" };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("validates a link with optional evidence", () => {
    const link = { type: "validates", target: "SPEC-001", evidence: "src/x.test.ts" };
    expect(LinkSchema.parse(link)).toEqual(link);
  });

  it("validates provenance", () => {
    const prov = {
      created_by: "claude-opus-4-7",
      session: "2026-04-30-1530",
      confidence: 0.85,
    };
    expect(ProvenanceSchema.parse(prov)).toEqual(prov);
  });

  it("rejects decision with status: superseded but no superseded_by link", () => {
    // semantic check belongs to validate, not schema; schema only enforces shape.
    const fm = {
      id: "ADR-001",
      title: "Use X",
      status: "superseded",
      created: "2026-04-30",
    };
    expect(() => DecisionFrontmatterSchema.parse(fm)).not.toThrow();
  });

  it("session frontmatter requires id, date, summary", () => {
    expect(() =>
      SessionFrontmatterSchema.parse({
        id: "2026-04-30-1530",
        date: "2026-04-30",
        summary: "Implemented login",
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test schema.test`
Expected: FAIL — `Cannot find module '../src/schema.js'`.

- [ ] **Step 3: Write `packages/core/src/types.ts`**

```ts
export const NODE_TYPES = [
  "goal",
  "intent",
  "spec",
  "decision",
  "plan",
  "task",
  "session",
  "change",
  "insight",
  "question",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const LINK_TYPES = [
  "implements",
  "implements_goal",
  "supersedes",
  "superseded_by",
  "validates",
  "blocks",
  "blocked_by",
  "touches",
  "planned_in",
  "sources",
] as const;

export type LinkType = (typeof LINK_TYPES)[number];
```

- [ ] **Step 4: Write `packages/core/src/schema.ts` — common pieces**

```ts
import { z } from "zod";
import { LINK_TYPES, NODE_TYPES } from "./types.js";

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const LinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  target: z.string().min(1),
  evidence: z.string().optional(),
});

export const ProvenanceSchema = z.object({
  created_by: z.string().min(1),
  session: z.string().min(1),
  evidence: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  last_verified: IsoDate.optional(),
});

export const VerificationSchema = z.object({
  test: z.string().optional(),
  commit: z.string().optional(),
  run: z.string().optional(),
}).refine(
  (v) => v.test || v.commit || v.run,
  { message: "verification must have at least one of: test, commit, run" },
);

const BaseFrontmatter = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  tags: z.array(z.string()).optional(),
  created: IsoDate,
  updated: IsoDate.optional(),
  provenance: ProvenanceSchema.optional(),
  links: z.array(LinkSchema).optional(),
  verification: VerificationSchema.optional(),
});
```

- [ ] **Step 5: Append per-type schemas to `schema.ts`**

```ts
// --- per-type schemas ---

const SpecStatus = z.enum(["active", "superseded", "removed", "done"]);
export const SpecFrontmatterSchema = BaseFrontmatter.extend({
  status: SpecStatus,
  updated: IsoDate, // required for specs
  phase: z.enum([
    "discovering",
    "specifying",
    "planning",
    "implementing",
    "reviewing",
    "shipping",
  ]).optional(),
});

const DecisionStatus = z.enum(["proposed", "accepted", "superseded"]);
export const DecisionFrontmatterSchema = BaseFrontmatter.extend({
  status: DecisionStatus,
  updated: IsoDate.optional(),
});

const PlanStatus = z.enum(["draft", "active", "superseded", "done"]);
export const PlanFrontmatterSchema = BaseFrontmatter.extend({
  status: PlanStatus,
  updated: IsoDate,
});

const TaskStatus = z.enum(["pending", "in_progress", "done", "blocked", "abandoned"]);
export const TaskFrontmatterSchema = BaseFrontmatter.extend({
  status: TaskStatus,
  updated: IsoDate,
});

const GoalStatus = z.enum(["active", "achieved", "abandoned"]);
export const GoalFrontmatterSchema = BaseFrontmatter.extend({
  status: GoalStatus,
  updated: IsoDate,
});

export const IntentFrontmatterSchema = BaseFrontmatter.extend({
  status: z.enum(["captured"]).default("captured"),
  source: z.string().optional(),
});

const SessionId = z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{4}$/, "expected yyyy-MM-dd-HHmm");
export const SessionFrontmatterSchema = z.object({
  id: SessionId,
  date: IsoDate,
  summary: z.string(),
  provenance: ProvenanceSchema.optional(),
  links: z.array(LinkSchema).optional(),
  tags: z.array(z.string()).optional(),
});

const InsightStatus = z.enum(["draft", "stable"]);
export const InsightFrontmatterSchema = BaseFrontmatter.extend({
  status: InsightStatus,
  promoted_to_global: z.boolean().optional(),
});

const QuestionStatus = z.enum(["open", "answered", "abandoned"]);
export const QuestionFrontmatterSchema = BaseFrontmatter.extend({
  status: QuestionStatus,
  answered_by: z.string().optional(), // ID reference
});

export const ChangeFrontmatterSchema = z.object({
  id: z.string(),
  date: IsoDate,
  type: z.enum(["created", "updated", "superseded", "archived", "removed", "promoted"]),
  target: z.string(),
  summary: z.string(),
  provenance: ProvenanceSchema.optional(),
});

// --- registry ---

export const FrontmatterSchemaByNodeType = {
  spec: SpecFrontmatterSchema,
  decision: DecisionFrontmatterSchema,
  plan: PlanFrontmatterSchema,
  task: TaskFrontmatterSchema,
  goal: GoalFrontmatterSchema,
  intent: IntentFrontmatterSchema,
  session: SessionFrontmatterSchema,
  insight: InsightFrontmatterSchema,
  question: QuestionFrontmatterSchema,
  change: ChangeFrontmatterSchema,
} as const;

export type SpecFrontmatter = z.infer<typeof SpecFrontmatterSchema>;
export type DecisionFrontmatter = z.infer<typeof DecisionFrontmatterSchema>;
export type SessionFrontmatter = z.infer<typeof SessionFrontmatterSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
```

- [ ] **Step 6: Update `packages/core/src/index.ts`**

```ts
export const VERSION = "0.0.0";
export * from "./types.js";
export * from "./schema.js";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test schema.test`
Expected: all 7 cases PASS.

- [ ] **Step 8: Run typecheck**

Run: `pnpm -F @cairndex/core typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/schema.ts packages/core/src/index.ts packages/core/tests/schema.test.ts
git commit -m "feat(core): add zod schemas for all 10 node types"
```

---

## Task 4: Frontmatter Parse/Serialize Module

**Files:**
- Create: `packages/core/src/frontmatter.ts`
- Create: `packages/core/tests/frontmatter.test.ts`
- Modify: `packages/core/src/index.ts`

**Spec reference:** §3 frontmatter examples.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../src/frontmatter.js";

const SAMPLE = `---
id: SPEC-001
title: Test
status: active
created: 2026-04-30
updated: 2026-04-30
---

## Body
hello world
`;

describe("frontmatter", () => {
  it("parses frontmatter and body", () => {
    const { data, content } = parseFrontmatter(SAMPLE);
    expect(data.id).toBe("SPEC-001");
    expect(data.title).toBe("Test");
    expect(content).toContain("## Body");
    expect(content).toContain("hello world");
  });

  it("serializes back to markdown with frontmatter", () => {
    const out = serializeFrontmatter(
      { id: "SPEC-002", title: "Out", status: "active", created: "2026-04-30", updated: "2026-04-30" },
      "## Body\nhi\n",
    );
    expect(out).toMatch(/^---\n/);
    expect(out).toContain("id: SPEC-002");
    expect(out).toContain("## Body");
  });

  it("round-trips without losing content", () => {
    const parsed = parseFrontmatter(SAMPLE);
    const out = serializeFrontmatter(parsed.data, parsed.content);
    const reparsed = parseFrontmatter(out);
    expect(reparsed.data).toEqual(parsed.data);
    expect(reparsed.content.trim()).toBe(parsed.content.trim());
  });

  it("handles a file with no frontmatter", () => {
    const { data, content } = parseFrontmatter("# just a heading\n");
    expect(data).toEqual({});
    expect(content).toContain("# just a heading");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test frontmatter.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/core/src/frontmatter.ts`**

```ts
import matter from "gray-matter";

export interface FrontmatterParsed<T = Record<string, unknown>> {
  data: T;
  content: string;
}

export function parseFrontmatter<T = Record<string, unknown>>(
  source: string,
): FrontmatterParsed<T> {
  const parsed = matter(source);
  return {
    data: parsed.data as T,
    content: parsed.content,
  };
}

export function serializeFrontmatter<T extends Record<string, unknown>>(
  data: T,
  content: string,
): string {
  return matter.stringify(content, data);
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

```ts
export const VERSION = "0.0.0";
export * from "./types.js";
export * from "./schema.js";
export * from "./frontmatter.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test frontmatter.test`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/frontmatter.ts packages/core/src/index.ts packages/core/tests/frontmatter.test.ts
git commit -m "feat(core): add frontmatter parse/serialize helpers"
```

---

## Task 5: ID Module (parse + generate)

**Files:**
- Create: `packages/core/src/ids.ts`
- Create: `packages/core/tests/ids.test.ts`
- Modify: `packages/core/src/index.ts`

**Spec reference:** §4 `ids:` config; Appendix A "Generate the next ID".

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  parseId,
  formatSequentialId,
  nextSequentialId,
  formatSessionId,
} from "../src/ids.js";

describe("ids", () => {
  it("parses a sequential id", () => {
    expect(parseId("SPEC-001")).toEqual({ prefix: "SPEC", number: 1, raw: "SPEC-001" });
  });

  it("parses an id with multi-digit number", () => {
    expect(parseId("ADR-042")).toEqual({ prefix: "ADR", number: 42, raw: "ADR-042" });
  });

  it("returns null for malformed id", () => {
    expect(parseId("not-an-id")).toBeNull();
    expect(parseId("SPEC-")).toBeNull();
  });

  it("formats a sequential id with zero padding", () => {
    expect(formatSequentialId("SPEC", 1)).toBe("SPEC-001");
    expect(formatSequentialId("ADR", 42)).toBe("ADR-042");
    expect(formatSequentialId("PLAN", 1234)).toBe("PLAN-1234");
  });

  it("computes next sequential id from existing list", () => {
    expect(nextSequentialId("SPEC", ["SPEC-001", "SPEC-003", "SPEC-002"])).toBe("SPEC-004");
  });

  it("returns first id when list is empty", () => {
    expect(nextSequentialId("SPEC", [])).toBe("SPEC-001");
  });

  it("ignores ids with different prefix", () => {
    expect(nextSequentialId("SPEC", ["ADR-001", "SPEC-001", "SPEC-002"])).toBe("SPEC-003");
  });

  it("formats session id from a Date", () => {
    const d = new Date("2026-04-30T15:30:00Z");
    // result is in UTC if we don't use local; spec says local — test local behavior
    expect(formatSessionId(d, { utc: true })).toBe("2026-04-30-1530");
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm test ids.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/core/src/ids.ts`**

```ts
export interface ParsedId {
  prefix: string;
  number: number;
  raw: string;
}

const ID_RE = /^([A-Z]+)-(\d+)$/;

export function parseId(raw: string): ParsedId | null {
  const m = ID_RE.exec(raw);
  if (!m || !m[1] || !m[2]) return null;
  return { prefix: m[1], number: Number.parseInt(m[2], 10), raw };
}

export function formatSequentialId(prefix: string, n: number): string {
  const padded = String(n).padStart(3, "0");
  return `${prefix}-${padded}`;
}

export function nextSequentialId(prefix: string, existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseId(id);
    if (parsed && parsed.prefix === prefix && parsed.number > max) {
      max = parsed.number;
    }
  }
  return formatSequentialId(prefix, max + 1);
}

export function formatSessionId(d: Date, opts: { utc?: boolean } = {}): string {
  const yyyy = opts.utc ? d.getUTCFullYear() : d.getFullYear();
  const MM = (opts.utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const dd = opts.utc ? d.getUTCDate() : d.getDate();
  const HH = opts.utc ? d.getUTCHours() : d.getHours();
  const mm = opts.utc ? d.getUTCMinutes() : d.getMinutes();
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${yyyy}-${p2(MM)}-${p2(dd)}-${p2(HH)}${p2(mm)}`;
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

```ts
export * from "./ids.js";
```
(append to existing exports)

- [ ] **Step 5: Run test, expect pass**

Run: `pnpm test ids.test`
Expected: all 8 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ids.ts packages/core/src/index.ts packages/core/tests/ids.test.ts
git commit -m "feat(core): add ID parsing and generation helpers"
```

---

## Task 6: Config Module + Path Helpers

**Files:**
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/src/config.ts`
- Create: `packages/core/tests/config.test.ts`
- Modify: `packages/core/src/index.ts`
- Add dep: `js-yaml`

**Spec reference:** §4 config.yaml schema.

- [ ] **Step 1: Add yaml dependency**

Run: `pnpm -F @cairndex/core add js-yaml && pnpm -F @cairndex/core add -D @types/js-yaml`
Expected: deps installed.

- [ ] **Step 2: Write the failing test**

```ts
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadProjectConfig, mergeConfig, defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("config", () => {
  it("returns default config when no file present", () => {
    const cfg = defaultConfig();
    expect(cfg.folders.specs).toBe("specs");
    expect(cfg.ids.spec).toBe("SPEC");
    expect(cfg.freshness_warn_days).toBe(30);
  });

  it("loads project config and merges over defaults", () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex", "config.yaml"),
      "schemaVersion: 1\nfolders:\n  specs: requirements\nids:\n  spec: REQ\n",
      "utf8",
    );
    const cfg = loadProjectConfig(tmp);
    expect(cfg.folders.specs).toBe("requirements");
    expect(cfg.ids.spec).toBe("REQ");
    expect(cfg.folders.decisions).toBe("decisions"); // default kept
  });

  it("merges arrays of required_frontmatter by replacement", () => {
    const merged = mergeConfig(defaultConfig(), {
      required_frontmatter: { spec: ["id", "title"] },
    });
    expect(merged.required_frontmatter.spec).toEqual(["id", "title"]);
    expect(merged.required_frontmatter.decision).toEqual(["id", "title", "status", "created"]);
  });

  it("rejects config with wrong schemaVersion", () => {
    mkdirSync(join(tmp, ".cairndex"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex", "config.yaml"), "schemaVersion: 99\n", "utf8");
    expect(() => loadProjectConfig(tmp)).toThrow(/schemaVersion/);
  });
});
```

- [ ] **Step 3: Run test, expect fail**

Run: `pnpm test config.test`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `packages/core/src/paths.ts`**

```ts
import { join } from "node:path";

export const VAULT_DIR = ".cairndex";
export const CONFIG_FILE = "config.yaml";
export const INDEX_FILE = "index.md";
export const ARCHIVE_DIR = "archive";

export function vaultPath(repoRoot: string): string {
  return join(repoRoot, VAULT_DIR);
}

export function configPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), CONFIG_FILE);
}

export function indexPath(repoRoot: string): string {
  return join(vaultPath(repoRoot), INDEX_FILE);
}

export function nodeFolderPath(repoRoot: string, folderName: string): string {
  return join(vaultPath(repoRoot), folderName);
}

export function archivePath(repoRoot: string): string {
  return join(vaultPath(repoRoot), ARCHIVE_DIR);
}
```

- [ ] **Step 5: Write `packages/core/src/config.ts`**

```ts
import { readFileSync, existsSync } from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import { configPath } from "./paths.js";
import { NODE_TYPES, type NodeType } from "./types.js";

const FoldersSchema = z.object({
  goals: z.string().default("goals"),
  intents: z.string().default("intents"),
  specs: z.string().default("specs"),
  decisions: z.string().default("decisions"),
  plans: z.string().default("plans"),
  tasks: z.string().default("tasks"),
  sessions: z.string().default("sessions"),
  changes: z.string().default("changes"),
  insights: z.string().default("insights"),
  questions: z.string().default("questions"),
  context: z.string().default("context"),
});

const IdsSchema = z.object({
  goal: z.string().default("GOAL"),
  intent: z.string().default("INT"),
  spec: z.string().default("SPEC"),
  decision: z.string().default("ADR"),
  plan: z.string().default("PLAN"),
  task: z.string().default("TASK"),
  session: z.string().default("yyyy-MM-dd-HHmm"),
  insight: z.string().default("INS"),
  question: z.string().default("QUESTION"),
  change: z.string().default("CHG"),
});

const RequiredFrontmatterSchema = z.object({
  spec: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  decision: z.array(z.string()).default(["id", "title", "status", "created"]),
  plan: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  task: z.array(z.string()).default(["id", "title", "status", "created", "updated"]),
  goal: z.array(z.string()).default(["id", "title", "status", "created"]),
  intent: z.array(z.string()).default(["id", "title", "created"]),
  session: z.array(z.string()).default(["id", "date", "summary"]),
  insight: z.array(z.string()).default(["id", "title", "status", "created"]),
  question: z.array(z.string()).default(["id", "title", "status", "created"]),
  change: z.array(z.string()).default(["id", "date", "type", "target", "summary"]),
});

export const ConfigSchema = z.object({
  schemaVersion: z.literal(1),
  folders: FoldersSchema.default({} as never),
  ids: IdsSchema.default({} as never),
  required_frontmatter: RequiredFrontmatterSchema.default({} as never),
  verification_required_for_status: z
    .array(z.string())
    .default(["done", "accepted"]),
  freshness_warn_days: z.number().int().min(0).default(30),
});

export type Config = z.infer<typeof ConfigSchema>;

export function defaultConfig(): Config {
  return ConfigSchema.parse({ schemaVersion: 1 });
}

export function loadProjectConfig(repoRoot: string): Config {
  const p = configPath(repoRoot);
  if (!existsSync(p)) return defaultConfig();
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw);
  return ConfigSchema.parse(data);
}

export function mergeConfig(base: Config, override: Partial<Config>): Config {
  return ConfigSchema.parse({
    schemaVersion: 1,
    folders: { ...base.folders, ...(override.folders ?? {}) },
    ids: { ...base.ids, ...(override.ids ?? {}) },
    required_frontmatter: { ...base.required_frontmatter, ...(override.required_frontmatter ?? {}) },
    verification_required_for_status:
      override.verification_required_for_status ?? base.verification_required_for_status,
    freshness_warn_days: override.freshness_warn_days ?? base.freshness_warn_days,
  });
}

export function folderForNodeType(cfg: Config, type: NodeType): string {
  const map: Record<NodeType, keyof typeof cfg.folders> = {
    goal: "goals",
    intent: "intents",
    spec: "specs",
    decision: "decisions",
    plan: "plans",
    task: "tasks",
    session: "sessions",
    change: "changes",
    insight: "insights",
    question: "questions",
  };
  return cfg.folders[map[type]];
}

export function nodeTypeForFolder(cfg: Config, folderName: string): NodeType | null {
  for (const t of NODE_TYPES) {
    if (folderForNodeType(cfg, t) === folderName) return t;
  }
  return null;
}
```

- [ ] **Step 6: Update `packages/core/src/index.ts`**

```ts
export * from "./paths.js";
export * from "./config.js";
```
(append)

- [ ] **Step 7: Run test**

Run: `pnpm test config.test`
Expected: 4 PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/paths.ts packages/core/src/config.ts packages/core/src/index.ts packages/core/tests/config.test.ts pnpm-lock.yaml packages/core/package.json
git commit -m "feat(core): add config loader with zod schema and merge helper"
```

---

## Task 7: Vault Module (read/write/list files)

**Files:**
- Create: `packages/core/src/vault.ts`
- Create: `packages/core/tests/vault.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readNode,
  writeNode,
  listNodeIds,
  listNodeFiles,
  vaultExists,
} from "../src/vault.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-vault-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("vault", () => {
  it("vaultExists returns false on empty dir", () => {
    expect(vaultExists(tmp)).toBe(false);
  });

  it("vaultExists returns true when .cairndex exists", () => {
    mkdirSync(join(tmp, ".cairndex"));
    expect(vaultExists(tmp)).toBe(true);
  });

  it("listNodeIds returns empty when folder absent", async () => {
    mkdirSync(join(tmp, ".cairndex"));
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids).toEqual([]);
  });

  it("listNodeIds finds SPEC-001 by filename pattern", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-login.md"), "---\nid: SPEC-001\ntitle: Login\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-002-logout.md"), "---\nid: SPEC-002\ntitle: Logout\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    writeFileSync(join(tmp, ".cairndex/specs/README.md"), "# Specs\n");
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids.sort()).toEqual(["SPEC-001", "SPEC-002"]);
  });

  it("readNode returns parsed frontmatter and content", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-login.md"), "---\nid: SPEC-001\ntitle: Login\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n\n## Body\nhello\n");
    const node = await readNode(tmp, defaultConfig(), "spec", "SPEC-001");
    expect(node).not.toBeNull();
    expect(node?.frontmatter.id).toBe("SPEC-001");
    expect(node?.body).toContain("hello");
    expect(node?.path).toMatch(/SPEC-001-login\.md$/);
  });

  it("writeNode creates folder and file", async () => {
    mkdirSync(join(tmp, ".cairndex"));
    await writeNode(tmp, defaultConfig(), "spec", {
      frontmatter: { id: "SPEC-001", title: "X", status: "active", created: "2026-04-30", updated: "2026-04-30" },
      body: "## Body\n",
      slug: "x",
    });
    const ids = await listNodeIds(tmp, defaultConfig(), "spec");
    expect(ids).toContain("SPEC-001");
  });

  it("listNodeFiles returns paths and frontmatter for each", async () => {
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-001-x.md"), "---\nid: ADR-001\ntitle: X\nstatus: accepted\ncreated: 2026-04-30\n---\n");
    const files = await listNodeFiles(tmp, defaultConfig(), "decision");
    expect(files).toHaveLength(1);
    expect(files[0]?.frontmatter.id).toBe("ADR-001");
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm test vault.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/core/src/vault.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { parseId } from "./ids.js";
import { nodeFolderPath, vaultPath } from "./paths.js";
import type { NodeType } from "./types.js";

export interface NodeFile {
  type: NodeType;
  id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface WriteNodeInput {
  frontmatter: Record<string, unknown>;
  body: string;
  slug?: string;
}

export function vaultExists(repoRoot: string): boolean {
  return existsSync(vaultPath(repoRoot));
}

function isNodeFile(filename: string): boolean {
  if (!filename.endsWith(".md")) return false;
  if (filename.toLowerCase() === "readme.md") return false;
  return true;
}

function idFromFilename(filename: string): string | null {
  const stem = filename.replace(/\.md$/, "");
  // Try "PREFIX-NUM[-slug]" first.
  const seq = parseId(stem.split("-").slice(0, 2).join("-"));
  if (seq) return seq.raw;
  // Fall back to date-based session id "yyyy-MM-dd-HHmm" (4 segments).
  const sessionMatch = /^(\d{4}-\d{2}-\d{2}-\d{4})/.exec(stem);
  if (sessionMatch) return sessionMatch[1] ?? null;
  return null;
}

export async function listNodeIds(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
): Promise<string[]> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  if (!existsSync(folder)) return [];
  const entries = await readdir(folder);
  const ids: string[] = [];
  for (const e of entries) {
    if (!isNodeFile(e)) continue;
    const id = idFromFilename(e);
    if (id) ids.push(id);
  }
  return ids;
}

export async function listNodeFiles(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
): Promise<NodeFile[]> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  if (!existsSync(folder)) return [];
  const entries = await readdir(folder);
  const out: NodeFile[] = [];
  for (const e of entries) {
    if (!isNodeFile(e)) continue;
    const id = idFromFilename(e);
    if (!id) continue;
    const full = join(folder, e);
    const raw = await readFile(full, "utf8");
    const { data, content } = parseFrontmatter(raw);
    out.push({ type, id, path: full, frontmatter: data, body: content });
  }
  return out;
}

export async function readNode(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
  id: string,
): Promise<NodeFile | null> {
  const all = await listNodeFiles(repoRoot, cfg, type);
  return all.find((n) => n.id === id) ?? null;
}

export async function writeNode(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
  input: WriteNodeInput,
): Promise<string> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  await mkdir(folder, { recursive: true });
  const id = String(input.frontmatter.id ?? "");
  if (!id) throw new Error("writeNode: frontmatter.id is required");
  const filename = input.slug ? `${id}-${input.slug}.md` : `${id}.md`;
  const fullPath = join(folder, filename);
  const out = serializeFrontmatter(input.frontmatter, input.body);
  await writeFile(fullPath, out, "utf8");
  return fullPath;
}

export function fileBasename(path: string): string {
  return basename(path);
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts`**

```ts
export * from "./vault.js";
```
(append)

- [ ] **Step 5: Run test**

Run: `pnpm test vault.test`
Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/vault.ts packages/core/src/index.ts packages/core/tests/vault.test.ts
git commit -m "feat(core): add vault read/write/list operations"
```

---

## Task 8: Templates Module

**Files:**
- Create: `packages/core/src/templates.ts`
- Create: `packages/core/tests/templates.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTemplate, renderTemplate } from "../src/templates.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-tpl-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("templates", () => {
  it("loads a template file from .cairndex/templates/", async () => {
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    writeFileSync(
      join(tmp, ".cairndex/templates/spec.md"),
      "---\nid: {{id}}\ntitle: {{title}}\nstatus: active\ncreated: {{today}}\nupdated: {{today}}\n---\n\n## Current Statement\n{{statement}}\n",
    );
    const tpl = await loadTemplate(tmp, "spec");
    expect(tpl).toContain("{{id}}");
    expect(tpl).toContain("## Current Statement");
  });

  it("returns null when template missing", async () => {
    mkdirSync(join(tmp, ".cairndex/templates"), { recursive: true });
    const tpl = await loadTemplate(tmp, "spec");
    expect(tpl).toBeNull();
  });

  it("renders {{var}} placeholders from a context map", () => {
    const out = renderTemplate(
      "id: {{id}}\ntoday: {{today}}\nname: {{name}}\n",
      { id: "SPEC-001", today: "2026-04-30", name: "Login" },
    );
    expect(out).toBe("id: SPEC-001\ntoday: 2026-04-30\nname: Login\n");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(renderTemplate("hello {{x}} {{y}}", { x: "world" })).toBe("hello world {{y}}");
  });
});
```

- [ ] **Step 2: Run test, expect fail**

Run: `pnpm test templates.test`
Expected: FAIL.

- [ ] **Step 3: Write `packages/core/src/templates.ts`**

```ts
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vaultPath } from "./paths.js";
import type { NodeType } from "./types.js";

const TEMPLATES_DIR = "templates";

export async function loadTemplate(
  repoRoot: string,
  type: NodeType,
): Promise<string | null> {
  const path = join(vaultPath(repoRoot), TEMPLATES_DIR, `${type}.md`);
  if (!existsSync(path)) return null;
  return await readFile(path, "utf8");
}

export function renderTemplate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in ctx ? (ctx[key] ?? match) : match;
  });
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./templates.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test templates.test`
Expected: 4 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/templates.ts packages/core/src/index.ts packages/core/tests/templates.test.ts
git commit -m "feat(core): add template loading and {{var}} rendering"
```

---

## Task 9: Normalize Module (frontmatter auto-fix)

**Files:**
- Create: `packages/core/src/normalize.ts`
- Create: `packages/core/tests/normalize.test.ts`
- Modify: `packages/core/src/index.ts`

**Spec reference:** §10 auto-fix rules.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { normalizeFrontmatter, normalizeTags } from "../src/normalize.js";

describe("normalize", () => {
  it("normalizes tags to kebab-case lowercase", () => {
    expect(normalizeTags(["Auth", "Security_Hardening", " API Token "])).toEqual([
      "auth",
      "security-hardening",
      "api-token",
    ]);
  });

  it("removes duplicate tags", () => {
    expect(normalizeTags(["auth", "Auth", "AUTH"])).toEqual(["auth"]);
  });

  it("sorts top-level frontmatter keys into canonical order", () => {
    const input = {
      tags: ["a"],
      title: "x",
      id: "SPEC-001",
      status: "active",
      created: "2026-04-30",
    };
    const out = normalizeFrontmatter(input);
    expect(Object.keys(out)).toEqual(["id", "title", "status", "tags", "created"]);
  });

  it("normalizes the tags array inside frontmatter", () => {
    const out = normalizeFrontmatter({ id: "SPEC-001", tags: ["Foo Bar", "BAZ"] });
    expect(out.tags).toEqual(["foo-bar", "baz"]);
  });

  it("touches updated when refreshTimestamp is true", () => {
    const out = normalizeFrontmatter(
      { id: "SPEC-001", updated: "2026-01-01" },
      { refreshTimestamp: true, today: "2026-04-30" },
    );
    expect(out.updated).toBe("2026-04-30");
  });

  it("does not touch updated when refreshTimestamp is false", () => {
    const out = normalizeFrontmatter(
      { id: "SPEC-001", updated: "2026-01-01" },
      { refreshTimestamp: false, today: "2026-04-30" },
    );
    expect(out.updated).toBe("2026-01-01");
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test normalize.test`

- [ ] **Step 3: Write `packages/core/src/normalize.ts`**

```ts
const CANONICAL_ORDER = [
  "id",
  "title",
  "status",
  "tags",
  "phase",
  "phase_since",
  "next_action",
  "created",
  "updated",
  "supersedes",
  "superseded_by",
  "blocked_by",
  "promoted_to_global",
  "source",
  "answered_by",
  "date",
  "type",
  "target",
  "summary",
  "provenance",
  "links",
  "verification",
];

export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((x): x is string => typeof x === "string")
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]+/g, ""),
    )
    .filter((t) => t.length > 0);
  return Array.from(new Set(cleaned));
}

export interface NormalizeOptions {
  refreshTimestamp?: boolean;
  today?: string; // YYYY-MM-DD; defaults to today's date in UTC
}

function todayUtc(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd}`;
}

export function normalizeFrontmatter(
  input: Record<string, unknown>,
  opts: NormalizeOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  if ("tags" in out) out.tags = normalizeTags(out.tags);

  if (opts.refreshTimestamp) {
    out.updated = opts.today ?? todayUtc();
  }

  // Sort by canonical order; unknown keys go to the end alphabetically.
  const known = CANONICAL_ORDER.filter((k) => k in out);
  const unknown = Object.keys(out)
    .filter((k) => !CANONICAL_ORDER.includes(k))
    .sort();
  const ordered: Record<string, unknown> = {};
  for (const k of [...known, ...unknown]) ordered[k] = out[k];
  return ordered;
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./normalize.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test normalize.test`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/normalize.ts packages/core/src/index.ts packages/core/tests/normalize.test.ts
git commit -m "feat(core): add frontmatter normalization (tags, key order, timestamp)"
```

---

## Task 10: Validation Engine + Rules

This task is large because §10 lists 13 rule categories. Decompose into one rule file per logical rule, all aggregated by `validate/index.ts`.

**Files:**
- Create: `packages/core/src/validate/index.ts`
- Create: `packages/core/src/validate/types.ts`
- Create: `packages/core/src/validate/rules/schema-required.ts`
- Create: `packages/core/src/validate/rules/id-consistency.ts`
- Create: `packages/core/src/validate/rules/reference-integrity.ts`
- Create: `packages/core/src/validate/rules/verification-bound.ts`
- Create: `packages/core/src/validate/rules/bidirectional.ts`
- Create: `packages/core/src/validate/rules/id-collision.ts`
- Create: `packages/core/src/validate/rules/provenance-present.ts`
- Create: `packages/core/src/validate/rules/freshness.ts`
- Create: `packages/core/src/validate/rules/tag-format.ts`
- Create: `packages/core/tests/validate.test.ts`
- Modify: `packages/core/src/index.ts`

(Plan 1 includes 9 of 12 rules; phase-coherence, unknown-folder, confidence-low are deferred to Plan 2.)

- [ ] **Step 1: Write `validate/types.ts`**

```ts
import type { NodeType } from "../types.js";

export type Severity = "error" | "warn" | "info";

export interface ValidationIssue {
  rule: string;
  severity: Severity;
  message: string;
  nodeType?: NodeType;
  nodeId?: string;
  path?: string;
  fixable: boolean;
}

export interface ValidationContext {
  repoRoot: string;
  // populated before rules run
  allNodes: ReadonlyArray<{
    type: NodeType;
    id: string;
    path: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }>;
}

export interface ValidationRule {
  name: string;
  run(ctx: ValidationContext): ValidationIssue[];
}
```

- [ ] **Step 2: Write the consolidated test (start with two rules)**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runValidation } from "../src/validate/index.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-val-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function vaultDir(): string {
  const d = join(tmp, ".cairndex");
  mkdirSync(d, { recursive: true });
  mkdirSync(join(d, "specs"), { recursive: true });
  mkdirSync(join(d, "decisions"), { recursive: true });
  return d;
}

describe("validate", () => {
  it("flags missing required field as error", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\n---\n");
    // missing `updated`
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some(
      (i) => i.rule === "schema-required" && i.severity === "error" && i.nodeId === "SPEC-001",
    )).toBe(true);
  });

  it("flags filename/frontmatter id mismatch as error", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-002\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "id-consistency" && i.severity === "error")).toBe(true);
  });

  it("flags broken supersedes link as error", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: superseded\ncreated: 2026-04-30\nlinks:\n  - { type: superseded_by, target: ADR-999 }\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "reference-integrity" && i.severity === "error")).toBe(true);
  });

  it("flags status: done without verification block as error", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: done\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "verification-bound" && i.severity === "error")).toBe(true);
  });

  it("flags duplicate id collision as error", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-y.md"),
      "---\nid: SPEC-001\ntitle: Y\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "id-collision" && i.severity === "error")).toBe(true);
  });

  it("warns when provenance block is missing", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.some((i) => i.rule === "provenance-present" && i.severity === "warn")).toBe(true);
  });

  it("returns no errors on a fully valid spec", async () => {
    vaultDir();
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\nprovenance:\n  created_by: claude\n  session: 2026-04-30-1530\n---\n");
    const issues = await runValidation(tmp, defaultConfig());
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, expect fail**

Run: `pnpm test validate.test`
Expected: FAIL.

- [ ] **Step 4: Write `validate/index.ts`**

```ts
import { listNodeFiles } from "../vault.js";
import { NODE_TYPES } from "../types.js";
import type { Config } from "../config.js";
import type { ValidationContext, ValidationIssue, ValidationRule } from "./types.js";
import { schemaRequired } from "./rules/schema-required.js";
import { idConsistency } from "./rules/id-consistency.js";
import { referenceIntegrity } from "./rules/reference-integrity.js";
import { verificationBound } from "./rules/verification-bound.js";
import { bidirectional } from "./rules/bidirectional.js";
import { idCollision } from "./rules/id-collision.js";
import { provenancePresent } from "./rules/provenance-present.js";
import { freshness } from "./rules/freshness.js";
import { tagFormat } from "./rules/tag-format.js";

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
];

export interface RunValidationOptions {
  rules?: readonly ValidationRule[];
}

export async function runValidation(
  repoRoot: string,
  cfg: Config,
  opts: RunValidationOptions = {},
): Promise<ValidationIssue[]> {
  const allNodes: ValidationContext["allNodes"] = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) allNodes.push({ ...f });
  }
  const ctx: ValidationContext = { repoRoot, allNodes };
  const out: ValidationIssue[] = [];
  const rules = opts.rules ?? RULES;
  for (const r of rules) out.push(...r.run(ctx));
  return out;
}

export type { ValidationIssue, ValidationRule, Severity, ValidationContext } from "./types.js";
```

The next sub-tasks add one rule file at a time. Each compiles independently; the index above already imports them so it won't compile until they exist — write them in this order.

- [ ] **Step 5: Write `rules/schema-required.ts`**

(For brevity, this rule reads `cfg.required_frontmatter` per type; since the rule has no `cfg` reference in `ctx`, accept a default list per type inline.)

```ts
import type { ValidationRule } from "../types.js";
import type { NodeType } from "../../types.js";

const REQUIRED: Record<NodeType, string[]> = {
  spec: ["id", "title", "status", "created", "updated"],
  decision: ["id", "title", "status", "created"],
  plan: ["id", "title", "status", "created", "updated"],
  task: ["id", "title", "status", "created", "updated"],
  goal: ["id", "title", "status", "created"],
  intent: ["id", "title", "created"],
  session: ["id", "date", "summary"],
  insight: ["id", "title", "status", "created"],
  question: ["id", "title", "status", "created"],
  change: ["id", "date", "type", "target", "summary"],
};

export const schemaRequired: ValidationRule = {
  name: "schema-required",
  run(ctx) {
    const issues = [];
    for (const node of ctx.allNodes) {
      const required = REQUIRED[node.type];
      for (const field of required) {
        if (!(field in node.frontmatter) || node.frontmatter[field] === undefined || node.frontmatter[field] === null) {
          issues.push({
            rule: "schema-required",
            severity: "error" as const,
            message: `${node.type} ${node.id} missing required field: ${field}`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: false,
          });
        }
      }
    }
    return issues;
  },
};
```

- [ ] **Step 6: Write `rules/id-consistency.ts`**

```ts
import { basename } from "node:path";
import type { ValidationRule } from "../types.js";
import { parseId } from "../../ids.js";

export const idConsistency: ValidationRule = {
  name: "id-consistency",
  run(ctx) {
    const issues = [];
    for (const node of ctx.allNodes) {
      const fname = basename(node.path).replace(/\.md$/, "");
      // Filename starts with the ID, then optional "-slug".
      const fmId = String(node.frontmatter.id ?? "");
      if (!fmId) continue; // schema-required will flag.
      if (!fname.startsWith(fmId)) {
        issues.push({
          rule: "id-consistency",
          severity: "error" as const,
          message: `filename ${fname} does not start with frontmatter id ${fmId}`,
          nodeType: node.type,
          nodeId: fmId,
          path: node.path,
          fixable: true,
        });
      }
    }
    return issues;
  },
};
```

- [ ] **Step 7: Write `rules/reference-integrity.ts`**

```ts
import type { ValidationRule } from "../types.js";

interface LinkLike { type: string; target: string }

export const referenceIntegrity: ValidationRule = {
  name: "reference-integrity",
  run(ctx) {
    const allIds = new Set(ctx.allNodes.map((n) => n.id));
    const issues = [];
    for (const node of ctx.allNodes) {
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        if (!link?.target) continue;
        if (!allIds.has(link.target)) {
          issues.push({
            rule: "reference-integrity",
            severity: "error" as const,
            message: `${node.id} link.${link.type} references unknown id: ${link.target}`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: false,
          });
        }
      }
    }
    return issues;
  },
};
```

- [ ] **Step 8: Write `rules/verification-bound.ts`**

```ts
import type { ValidationRule } from "../types.js";

const REQUIRES_VERIFICATION: Record<string, ReadonlySet<string>> = {
  spec: new Set(["done"]),
  plan: new Set(["done"]),
  task: new Set(["done"]),
  decision: new Set(["accepted"]),
  goal: new Set(["achieved"]),
  insight: new Set(),
  intent: new Set(),
  session: new Set(),
  change: new Set(),
  question: new Set(["answered"]),
};

export const verificationBound: ValidationRule = {
  name: "verification-bound",
  run(ctx) {
    const issues = [];
    for (const node of ctx.allNodes) {
      const status = String(node.frontmatter.status ?? "");
      const required = REQUIRES_VERIFICATION[node.type];
      if (!required || !required.has(status)) continue;
      const v = node.frontmatter.verification as { test?: unknown; commit?: unknown; run?: unknown } | undefined;
      const has = v && (v.test || v.commit || v.run);
      if (!has) {
        issues.push({
          rule: "verification-bound",
          severity: "error" as const,
          message: `${node.id} has status: ${status} but no verification (test/commit/run) is set`,
          nodeType: node.type,
          nodeId: node.id,
          path: node.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
```

- [ ] **Step 9: Write `rules/bidirectional.ts`**

```ts
import type { ValidationRule } from "../types.js";

interface LinkLike { type: string; target: string }

const RECIPROCALS: Record<string, string> = {
  supersedes: "superseded_by",
  superseded_by: "supersedes",
  blocks: "blocked_by",
  blocked_by: "blocks",
};

export const bidirectional: ValidationRule = {
  name: "bidirectional",
  run(ctx) {
    const byId = new Map(ctx.allNodes.map((n) => [n.id, n] as const));
    const issues = [];
    for (const node of ctx.allNodes) {
      const links = (node.frontmatter.links ?? []) as LinkLike[];
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        const reciprocal = RECIPROCALS[link.type];
        if (!reciprocal) continue;
        const target = byId.get(link.target);
        if (!target) continue; // reference-integrity flags this.
        const targetLinks = (target.frontmatter.links ?? []) as LinkLike[];
        const has = Array.isArray(targetLinks) && targetLinks.some(
          (l) => l.type === reciprocal && l.target === node.id,
        );
        if (!has) {
          issues.push({
            rule: "bidirectional",
            severity: "error" as const,
            message: `${node.id}.${link.type} -> ${link.target}, but ${link.target}.${reciprocal} -> ${node.id} is missing`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: true,
          });
        }
      }
    }
    return issues;
  },
};
```

- [ ] **Step 10: Write `rules/id-collision.ts`**

```ts
import type { ValidationRule } from "../types.js";

export const idCollision: ValidationRule = {
  name: "id-collision",
  run(ctx) {
    const seen = new Map<string, string[]>();
    for (const n of ctx.allNodes) {
      const list = seen.get(n.id) ?? [];
      list.push(n.path);
      seen.set(n.id, list);
    }
    const issues = [];
    for (const [id, paths] of seen) {
      if (paths.length > 1) {
        for (const p of paths) {
          issues.push({
            rule: "id-collision",
            severity: "error" as const,
            message: `id ${id} appears in multiple files: ${paths.join(", ")}`,
            nodeId: id,
            path: p,
            fixable: false,
          });
        }
      }
    }
    return issues;
  },
};
```

- [ ] **Step 11: Write `rules/provenance-present.ts`**

```ts
import type { ValidationRule } from "../types.js";

export const provenancePresent: ValidationRule = {
  name: "provenance-present",
  run(ctx) {
    const issues = [];
    for (const node of ctx.allNodes) {
      const p = node.frontmatter.provenance as { created_by?: unknown; session?: unknown } | undefined;
      if (!p || !p.created_by || !p.session) {
        issues.push({
          rule: "provenance-present",
          severity: "warn" as const,
          message: `${node.id} has incomplete or missing provenance (need created_by and session)`,
          nodeType: node.type,
          nodeId: node.id,
          path: node.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
```

- [ ] **Step 12: Write `rules/freshness.ts`**

```ts
import type { ValidationRule } from "../types.js";

const DEFAULT_DAYS = 30;

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.floor((db - da) / 86400000);
}

function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export const freshness: ValidationRule = {
  name: "freshness",
  run(ctx) {
    const today = todayUtc();
    const issues = [];
    for (const node of ctx.allNodes) {
      const status = String(node.frontmatter.status ?? "");
      if (status !== "active") continue;
      const updated = String(node.frontmatter.updated ?? node.frontmatter.created ?? "");
      if (!updated) continue;
      if (daysBetween(updated, today) > DEFAULT_DAYS) {
        issues.push({
          rule: "freshness",
          severity: "warn" as const,
          message: `${node.id} active but updated > ${DEFAULT_DAYS} days ago (${updated})`,
          nodeType: node.type,
          nodeId: node.id,
          path: node.path,
          fixable: false,
        });
      }
    }
    return issues;
  },
};
```

- [ ] **Step 13: Write `rules/tag-format.ts`**

```ts
import type { ValidationRule } from "../types.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const tagFormat: ValidationRule = {
  name: "tag-format",
  run(ctx) {
    const issues = [];
    for (const node of ctx.allNodes) {
      const tags = node.frontmatter.tags;
      if (!Array.isArray(tags)) continue;
      for (const t of tags) {
        if (typeof t !== "string" || !KEBAB.test(t)) {
          issues.push({
            rule: "tag-format",
            severity: "warn" as const,
            message: `${node.id} has non-kebab-case tag: ${String(t)}`,
            nodeType: node.type,
            nodeId: node.id,
            path: node.path,
            fixable: true,
          });
        }
      }
    }
    return issues;
  },
};
```

- [ ] **Step 14: Update `packages/core/src/index.ts`**

```ts
export * from "./validate/index.js";
```

- [ ] **Step 15: Run tests**

Run: `pnpm test validate.test`
Expected: 7 PASS.

- [ ] **Step 16: Commit**

```bash
git add packages/core/src/validate packages/core/src/index.ts packages/core/tests/validate.test.ts
git commit -m "feat(core): add validation engine with 9 rules"
```

---

## Task 11: Backlinks Module

**Files:**
- Create: `packages/core/src/backlinks.ts`
- Create: `packages/core/tests/backlinks.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeBacklinks } from "../src/backlinks.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-bl-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function setup(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(tmp, ".cairndex", path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
}

describe("backlinks", () => {
  it("collects typed-edge backlinks from frontmatter links", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "decisions/ADR-001-a.md":
        "---\nid: ADR-001\ntitle: A\nstatus: accepted\ncreated: 2026-04-30\nlinks:\n  - { type: implements, target: SPEC-001 }\n---\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    expect(idx.get("SPEC-001")).toEqual([
      { from: "ADR-001", type: "implements" },
    ]);
  });

  it("collects [[wikilinks]] from body as 'mentions' edges", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
      "sessions/2026-04-30-1530.md":
        "---\nid: 2026-04-30-1530\ndate: 2026-04-30\nsummary: ok\n---\n\nTouched [[SPEC-001]] today.\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    const refs = idx.get("SPEC-001") ?? [];
    expect(refs).toContainEqual({ from: "2026-04-30-1530", type: "mentions" });
  });

  it("returns empty entry for nodes with no backlinks", async () => {
    setup({
      "specs/SPEC-001-a.md":
        "---\nid: SPEC-001\ntitle: A\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n",
    });
    const idx = await computeBacklinks(tmp, defaultConfig());
    expect(idx.get("SPEC-001") ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test backlinks.test`

- [ ] **Step 3: Write `packages/core/src/backlinks.ts`**

```ts
import { listNodeFiles } from "./vault.js";
import { NODE_TYPES } from "./types.js";
import type { Config } from "./config.js";

export interface Backlink {
  from: string;
  type: string; // typed-edge type, or "mentions" for wikilinks
}

export type BacklinkIndex = Map<string, Backlink[]>;

const WIKILINK_RE = /\[\[([A-Z]+-\d+|[\d-]+)\]\]/g;

interface LinkLike { type: string; target: string }

export async function computeBacklinks(repoRoot: string, cfg: Config): Promise<BacklinkIndex> {
  const idx: BacklinkIndex = new Map();
  const all: { id: string; body: string; frontmatter: Record<string, unknown> }[] = [];
  for (const t of NODE_TYPES) {
    for (const n of await listNodeFiles(repoRoot, cfg, t)) {
      all.push({ id: n.id, body: n.body, frontmatter: n.frontmatter });
      if (!idx.has(n.id)) idx.set(n.id, []);
    }
  }
  for (const n of all) {
    // typed edges
    const links = (n.frontmatter.links ?? []) as LinkLike[];
    if (Array.isArray(links)) {
      for (const link of links) {
        if (!link?.target) continue;
        const list = idx.get(link.target) ?? [];
        list.push({ from: n.id, type: link.type });
        idx.set(link.target, list);
      }
    }
    // wikilinks in body
    let m: RegExpExecArray | null;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(n.body)) !== null) {
      const target = m[1];
      if (!target) continue;
      const list = idx.get(target) ?? [];
      list.push({ from: n.id, type: "mentions" });
      idx.set(target, list);
    }
  }
  return idx;
}
```

- [ ] **Step 4: Update index**

```ts
export * from "./backlinks.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test backlinks.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/backlinks.ts packages/core/src/index.ts packages/core/tests/backlinks.test.ts
git commit -m "feat(core): add backlink index from typed edges and wikilinks"
```

---

## Task 12: Archive Module

**Files:**
- Create: `packages/core/src/archive.ts`
- Create: `packages/core/tests/archive.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveIfNeeded, archiveAllStaleStatuses } from "../src/archive.js";
import { defaultConfig } from "../src/config.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "cairn-arch-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("archive", () => {
  it("does nothing when status is not removed/archived", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(f,
      "---\nid: SPEC-001\ntitle: X\nstatus: active\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const moved = await archiveIfNeeded(tmp, defaultConfig(), f);
    expect(moved).toBeNull();
    expect(existsSync(f)).toBe(true);
  });

  it("moves a file with status: removed to archive/", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    const f = join(tmp, ".cairndex/specs/SPEC-001-x.md");
    writeFileSync(f,
      "---\nid: SPEC-001\ntitle: X\nstatus: removed\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    const moved = await archiveIfNeeded(tmp, defaultConfig(), f);
    expect(moved).not.toBeNull();
    expect(existsSync(f)).toBe(false);
    expect(existsSync(join(tmp, ".cairndex/archive/specs/SPEC-001-x.md"))).toBe(true);
  });

  it("archiveAllStaleStatuses sweeps all node folders", async () => {
    mkdirSync(join(tmp, ".cairndex/specs"), { recursive: true });
    mkdirSync(join(tmp, ".cairndex/decisions"), { recursive: true });
    writeFileSync(join(tmp, ".cairndex/specs/SPEC-001-x.md"),
      "---\nid: SPEC-001\ntitle: X\nstatus: removed\ncreated: 2026-04-30\nupdated: 2026-04-30\n---\n");
    writeFileSync(join(tmp, ".cairndex/decisions/ADR-001-x.md"),
      "---\nid: ADR-001\ntitle: X\nstatus: archived\ncreated: 2026-04-30\n---\n");
    const moved = await archiveAllStaleStatuses(tmp, defaultConfig());
    expect(moved.length).toBe(2);
    expect(existsSync(join(tmp, ".cairndex/archive/specs/SPEC-001-x.md"))).toBe(true);
    expect(existsSync(join(tmp, ".cairndex/archive/decisions/ADR-001-x.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test archive.test`

- [ ] **Step 3: Write `packages/core/src/archive.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, rename } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType, nodeTypeForFolder } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import { archivePath, vaultPath } from "./paths.js";
import { listNodeFiles } from "./vault.js";
import { NODE_TYPES } from "./types.js";

const ARCHIVE_STATUSES = new Set(["removed", "archived", "abandoned"]);

export async function archiveIfNeeded(
  repoRoot: string,
  _cfg: Config,
  filePath: string,
): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, "utf8");
  const { data } = parseFrontmatter(raw);
  const status = String((data as Record<string, unknown>).status ?? "");
  if (!ARCHIVE_STATUSES.has(status)) return null;
  const vault = vaultPath(repoRoot);
  const rel = relative(vault, filePath); // e.g., "specs/SPEC-001-x.md"
  const dest = join(archivePath(repoRoot), rel);
  await mkdir(dirname(dest), { recursive: true });
  await rename(filePath, dest);
  return dest;
}

export async function archiveAllStaleStatuses(
  repoRoot: string,
  cfg: Config,
): Promise<string[]> {
  const moved: string[] = [];
  for (const t of NODE_TYPES) {
    const files = await listNodeFiles(repoRoot, cfg, t);
    for (const f of files) {
      const status = String(f.frontmatter.status ?? "");
      if (!ARCHIVE_STATUSES.has(status)) continue;
      const dest = await archiveIfNeeded(repoRoot, cfg, f.path);
      if (dest) moved.push(dest);
    }
  }
  return moved;
}

export function isArchivable(status: string): boolean {
  return ARCHIVE_STATUSES.has(status);
}

// suppress unused-import lint
void nodeTypeForFolder;
void basename;
void folderForNodeType;
```

- [ ] **Step 4: Update index**

```ts
export * from "./archive.js";
```

- [ ] **Step 5: Run test**

Run: `pnpm test archive.test`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/archive.ts packages/core/src/index.ts packages/core/tests/archive.test.ts
git commit -m "feat(core): add archive helpers (move on status: removed/archived)"
```

---

## Task 13: Default Templates and Operating Rules (shipped content)

**Files:**
- Create: `templates/rules/operating-rules.md`
- Create: `templates/templates/spec.md`
- Create: `templates/templates/decision.md`
- Create: `templates/templates/plan.md`
- Create: `templates/templates/task.md`
- Create: `templates/templates/session.md`
- Create: `templates/templates/insight.md`
- Create: `templates/templates/question.md`
- Create: `templates/templates/change.md`
- Create: `templates/templates/goal.md`
- Create: `templates/templates/intent.md`

These default files are bundled with cairndex and copied into `~/.cairndex/shared/` and `<repo>/.cairndex/{rules,templates}/` by `cairndex init` (Plan 2). Plan 1 just authors them.

**Spec reference:** Appendix A.

- [ ] **Step 1: Write `templates/rules/operating-rules.md`**

Use the exact content from the spec Appendix A. Path: `templates/rules/operating-rules.md`. Copy verbatim from the design doc.

- [ ] **Step 2: Write `templates/templates/spec.md`**

```md
---
id: {{id}}
title: {{title}}
status: active
tags: []
created: {{today}}
updated: {{today}}
provenance:
  created_by: {{agent}}
  session: {{session}}
  confidence: 0.7
links: []
---

## Current Statement

(Describe what this spec requires.)

## Rationale

(Why this spec exists.)

## Open Questions

- 

## History

- {{today}} — Created.
```

- [ ] **Step 3: Write `templates/templates/decision.md`**

```md
---
id: {{id}}
title: {{title}}
status: proposed
tags: []
created: {{today}}
provenance:
  created_by: {{agent}}
  session: {{session}}
  confidence: 0.7
links: []
---

## Context

(What is the situation?)

## Decision

(What did we decide?)

## Consequences

(What follows from this decision?)
```

- [ ] **Step 4: Write `templates/templates/plan.md`**

```md
---
id: {{id}}
title: {{title}}
status: draft
tags: []
created: {{today}}
updated: {{today}}
provenance:
  created_by: {{agent}}
  session: {{session}}
  confidence: 0.6
links: []
---

## Goal

(One sentence.)

## Steps

1. 
2. 
3. 

## History

- {{today}} — Created.
```

- [ ] **Step 5: Write `templates/templates/task.md`**

```md
---
id: {{id}}
title: {{title}}
status: pending
tags: []
created: {{today}}
updated: {{today}}
links: []
---

## Description

(What needs to happen?)

## Acceptance

(How do we know it's done?)
```

- [ ] **Step 6: Write `templates/templates/session.md`**

```md
---
id: {{id}}
date: {{today}}
summary: "{{summary}}"
provenance:
  created_by: {{agent}}
  session: {{id}}
links: []
---

## What I did

(Bullet list.)

## What changed

(Files, decisions, specs touched.)

## Next

(One-line next action.)
```

- [ ] **Step 7: Write `templates/templates/insight.md`**

```md
---
id: {{id}}
title: {{title}}
status: draft
tags: []
created: {{today}}
provenance:
  created_by: {{agent}}
  session: {{session}}
links: []
---

## Pattern

(What is the reusable pattern?)

## Source

(Which session/incident did this come from?)

## Applicable when

(When should we use this?)
```

- [ ] **Step 8: Write `templates/templates/question.md`**

```md
---
id: {{id}}
title: {{title}}
status: open
tags: []
created: {{today}}
links: []
---

## Question

(What is unclear?)

## What we know

(Current understanding.)

## Resolution

(Filled in when answered. Set status: answered and add answered_by: <ID>.)
```

- [ ] **Step 9: Write `templates/templates/change.md`**

```md
---
id: {{id}}
date: {{today}}
type: created
target: {{target}}
summary: "{{summary}}"
---
```

- [ ] **Step 10: Write `templates/templates/goal.md`**

```md
---
id: {{id}}
title: {{title}}
status: active
tags: []
created: {{today}}
links: []
---

## Statement

(The north-star goal.)

## Why this matters

(Motivation.)

## Success looks like

(Measurable outcome.)
```

- [ ] **Step 11: Write `templates/templates/intent.md`**

```md
---
id: {{id}}
title: {{title}}
created: {{today}}
source: ""
links: []
---

## Verbatim ask

(Captured user/stakeholder language, do not paraphrase.)

## Provenance

(Who said it, when, where.)
```

- [ ] **Step 12: Commit**

```bash
git add templates/
git commit -m "feat: add default operating-rules and 10 node templates"
```

---

## Task 14: Final Public API Surface + Plan 1 Smoke Test

**Files:**
- Modify: `packages/core/src/index.ts` (final consolidated re-exports)
- Create: `packages/core/tests/api-surface.test.ts`

- [ ] **Step 1: Verify `packages/core/src/index.ts` exports everything**

Final content:

```ts
export const VERSION = "0.0.0";
export * from "./types.js";
export * from "./schema.js";
export * from "./frontmatter.js";
export * from "./ids.js";
export * from "./paths.js";
export * from "./config.js";
export * from "./vault.js";
export * from "./templates.js";
export * from "./normalize.js";
export * from "./validate/index.js";
export * from "./backlinks.js";
export * from "./archive.js";
```

- [ ] **Step 2: Write `packages/core/tests/api-surface.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

describe("public api surface", () => {
  it("exports all required modules", () => {
    const expected = [
      "VERSION",
      "NODE_TYPES",
      "LINK_TYPES",
      "SpecFrontmatterSchema",
      "DecisionFrontmatterSchema",
      "SessionFrontmatterSchema",
      "LinkSchema",
      "ProvenanceSchema",
      "VerificationSchema",
      "FrontmatterSchemaByNodeType",
      "parseFrontmatter",
      "serializeFrontmatter",
      "parseId",
      "formatSequentialId",
      "nextSequentialId",
      "formatSessionId",
      "VAULT_DIR",
      "vaultPath",
      "configPath",
      "indexPath",
      "archivePath",
      "ConfigSchema",
      "defaultConfig",
      "loadProjectConfig",
      "mergeConfig",
      "folderForNodeType",
      "nodeTypeForFolder",
      "vaultExists",
      "readNode",
      "writeNode",
      "listNodeIds",
      "listNodeFiles",
      "loadTemplate",
      "renderTemplate",
      "normalizeFrontmatter",
      "normalizeTags",
      "runValidation",
      "computeBacklinks",
      "archiveIfNeeded",
      "archiveAllStaleStatuses",
      "isArchivable",
    ];
    for (const name of expected) {
      expect(core, `missing export: ${name}`).toHaveProperty(name);
    }
  });
});
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: all tests across all task files PASS, no failures.

- [ ] **Step 4: Run typecheck across workspace**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: no errors. Fix any biome issues.

- [ ] **Step 6: Run build**

Run: `pnpm build`
Expected: `packages/core/dist/index.js` and `dist/index.d.ts` produced.

- [ ] **Step 7: Run coverage and verify ≥80%**

Run: `pnpm vitest run --coverage`
Expected: `packages/core/src` coverage ≥80% lines/functions/statements.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/index.ts packages/core/tests/api-surface.test.ts
git commit -m "test(core): add api surface guard test; verify build, typecheck, coverage"
```

---

## Plan 1 Done — Acceptance

After all tasks complete:

1. `pnpm test` — all tests pass
2. `pnpm typecheck` — no TS errors
3. `pnpm lint` — no biome errors
4. `pnpm build` — `packages/core/dist/index.js` exists
5. Coverage on `packages/core/src` ≥ 80%
6. Public API exports listed in Task 14 step 2 are all present
7. The library can be consumed by `import * as core from "@cairndex/core"` from any other workspace package
8. `templates/` folder contains operating-rules.md and 10 node templates with `{{var}}` placeholders

**Git state**: a clean linear history of TDD commits, one feature per commit, all on `main`.

---

## Out of Scope (Plan 1)

The following are explicitly deferred to later plans:

- **Plan 2 — Core workflow modules**: `sync.ts` (three-way merge), `autoSession.ts` (Stop hook session generator), `claudeMd.ts` (idempotent CLAUDE.md merge), `registry.ts` (~/.cairndex/projects.json), `watcher.ts` (chokidar wrapper). Also rules: `phase-coherence`, `unknown-folder`, `confidence-low`. Also the `--fix` mode of validate.
- **Plan 3 — CLI**: `packages/cli` with `init`, `ui`, `sync`, `doctor`, `insight promote/pull` commands.
- **Plan 4 — Server + Web GUI**: `packages/server` (Fastify) and `packages/web` (React + Vite).

Each of those is its own self-contained plan written when Plan 1 is approved and merged.
