---
id: pack-phase-1-ship-5795b9f6
type: context-pack
task: phase 1 ship
builtAt: '2026-05-01T17:57:44.641Z'
tokenEstimate: 1087
tokenBudget: 8000
trimmedItems: 0
items:
  - id: PROJECT-STATE
    type: project-state
    reason: project state
  - id: SPEC-001
    type: spec
    reason: active spec
  - id: TASK-001
    type: task
    reason: current task
  - id: 2026-05-02-0125
    type: session
    reason: recent session (last 4)
warnings: []
---
# Context Pack: phase 1 ship

Token estimate: 1087 / 8000 (14%)

## 1. PROJECT-STATE
*Project State*

> reason: project state

Phase: discovering
Phase since: 2026-05-01
Active spec: SPEC-001 (active) — Memory Cockpit — Phase 1 core loop
Current task: TASK-001 — Bump vite to 6.x and verify web build/dev flow (pending)
Next action: TODO

## 2. SPEC-001 (active)
*Memory Cockpit — Phase 1 core loop*

> reason: active spec

## Summary

Lift Cairndex from "Markdown vault + doctor" to "Memory Cockpit": the system tells agent and user, in one motion, what to read, why, what's stale, and what `CLAUDE.md` should look like.

Full design: `docs/superpowers/specs/2026-05-02-cairndex-memory-cockpit-design.md` (gitignored — local copy).

## Phase 1 deliverables

1. `cairndex context [<task-label>]` — token-budgeted context pack written to `.cairndex/indexes/context-packs/<hash>.md` and emitted to stdout. Selection is rules-only (active spec/plan/task + recent sessions + backlinked decisions + open questions). No search engine.
2. `.cairndex/indexes/` derived layer (`active-context.json`, `node-summary.json`, `backlinks.json`, `memory-health.json`, `context-packs/`).
3. `cairndex emit claude-md` — auto-emit `<!-- cairndex:agent-surface -->` region in `CLAUDE.md`; preserve user content outside the region.
4. CLAUDE.md mixed-region convention + watcher maintenance.
5. Cockpit Dashboard v1 — vertical stack: Project State / Agent Context / Memory Health / Recent Activity.
6. Context Pack Preview UI — linear list with reasons (`/p/:alias/pack` and `/p/:alias/pack/:packId`).
7. `.cairndex/inbox/proposed-memory-updates/` directory + agent guidance footer (no enforcement in Phase 1).

All new commands and routes accept `--vault <path>` / `vaultRoot` to preserve the multi-vault application posture.

## Out of scope (Phase 2/3)

- Review Inbox processing (dedupe, conflict, accept/reject) — Phase 2.
- Memory Health v2 (contradiction graph, decay) — Phase 2.
- MCP server / SessionStart hook injection — Phase 3.
- Tauri desktop app / vault registry — Phase 3+.
- Any text search engine.
- Folder reorg.

## Verification

Phase 0: see ADR-001 for security waiver decision.

Phase 1 ship gate (dogfood demo on Cairndex repo):
1. `cairndex doctor` → green
2. `cairndex context "build memory cockpit"` → pack file + stdout body, ≤8000 tokens
3. `cairndex emit claude-md` → region populated with phase/active/health/context-cmd/inbox-hint
4. `cairndex ui` → Dashboard shows 4 panels; Pack Preview renders linear list with reasons
5. `.cairndex/inbox/proposed-memory-updates/` exists
6. `cairndex doctor` still green
7. All new modules unit/integration tested; existing tests not regressed.

## 3. TASK-001 (pending)
*Bump vite to 6.x and verify web build/dev flow*

> reason: current task

## Description

After Phase 1 of Memory Cockpit ships, bump `vite` from `^5.4.0` to `^6.0.0` in `packages/web` to clear the two remaining `pnpm audit` warnings (esbuild + vite dev-server CVEs, both dev-only).

Per ADR-001 these were waived in Phase 0 to avoid bundling unrelated breaking-change risk into the Memory Cockpit work.

## Acceptance

- `packages/web/package.json` declares `"vite": "^6.0.0"`.
- `pnpm install`, `pnpm test`, `pnpm build`, `pnpm dev` (web) all succeed.
- `pnpm audit` reports 0 vulnerabilities related to vite/esbuild.
- No regressions in existing web E2E or unit tests.

## 4. 2026-05-02-0125

> reason: recent session (last 4)

## What I did

- `pnpm install` — lockfile clean, 0 changes.
- `pnpm test` — 162/162 passing after fixing 2 wikilink fallback URL tests.
- `pnpm build` — all 5 workspaces green (core / cli / server / web / templates).
- `pnpm audit` — 4 moderate vulns initially, 2 after fix.
- Initialized cairndex vault on Cairndex itself (dogfooding).

## What changed

- `packages/web/src/lib/remarkWikilinks.ts` — fallback URL `#${id}` → `#/node/${id}` to match test expectation and produce a meaningful node-shaped anchor.
- `packages/server/package.json` — `@fastify/static` `^8.0.0` → `^9.1.1` (security patch).
- `pnpm-lock.yaml` — regenerated for the dep bump.
- `.cairndex/` — created.
- `CLAUDE.md` — created by `cairndex init`.
- `.claude/settings.json` — created by `cairndex init` (PostToolUse + Stop hooks).
- `docs/superpowers/specs/2026-05-02-cairndex-memory-cockpit-design.md` — design spec written (gitignored).

## Next

Start Phase 1: build context-pack + indexes/ derivation, in TDD order.

---

If you need more than what's listed here, `grep .cairndex/` directly.

Durable memory changes (decisions, specs, insights, plan/task state) should
propose through `.cairndex/inbox/proposed-memory-updates/` unless the user
explicitly accepts inline.
