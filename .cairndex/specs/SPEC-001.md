---
id: SPEC-001
title: Memory Cockpit — Phase 1 core loop
status: active
tags: [memory-cockpit, context-pack, indexes, ui]
created: 2026-05-02
updated: 2026-05-02
provenance:
  created_by: claude-code
  session: 2026-05-02-0125
  confidence: 0.9
links: []
---

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
