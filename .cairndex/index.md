---
phase: implementing
phase_since: 2026-05-02
next_action: "Awaiting user direction — central-vault migration finished (PLAN-001 phases A-F closed)"
active_spec: SPEC-001
current_task: TASK-001
---

# Project Index

**Status:** Central-vault migration finished. PLAN-001 closed end-to-end: ProjectRef + vault/project manifests + CLI/server/UI/agent surfaces all routed through `{ vaultRoot, projectId }`, hooks installer is layout-aware, agent text and CLI error messages no longer hardcode `.cairndex/`. Typecheck green across all packages; 67 vitest files / 337 tests + 7 web files / 11 tests all green. Smoke verified: `vault init` → `project register` → `doctor` (exit 0) → `context` (pack written under `projects/<id>/indexes/context-packs/`) → `emit claude-md` (region populated, central inbox hint present). Working tree has uncommitted changes; user controls when to commit.
**Active focus:** Awaiting user direction. Open candidates: TASK-001 (vite bump), Tauri compile, dogfood the new central layout end-to-end on a second project, run Playwright e2e (added `central-vault.spec.ts` not yet executed locally).

## Must-know now
- **Never auto-commit / auto-push.** User controls all commit boundaries (`~/.claude/CLAUDE.md` rule).
- **Central vault is the target architecture.** Cairndex should work like an
  Obsidian vault: one user-selected vault contains every project under
  `projects/<project-id>/`; repo-local `.cairndex/` is only legacy
  implementation and migration source.
- **Inbox is the write gate.** Durable memory (specs, decisions, insights,
  plan/task state) should propose through
  `projects/<project-id>/inbox/proposed-memory-updates/` unless explicitly
  accepted inline.
- Latest session note: [[2026-05-02-1900]] — full handoff for next-session resume.

## Recent changes

<!-- cairndex:recent-changes:start -->
- 2026-05-02 — Phase 9 (auto-archive proposer + sweep + Stop hook integration) + browser dogfood.
- 2026-05-02 — Phases 1-8 shipped (context pack, indexes, inbox, MCP, cockpit UI, consolidate).
- 2026-05-01 — cairndex initialized.
<!-- cairndex:recent-changes:end -->

## Read next
- `docs/superpowers/specs/2026-05-02-cairndex-central-vault-architecture.md` (accepted central vault direction)
- `.cairndex/sessions/2026-05-02-1900.md` (latest handoff)
- `.cairndex/specs/SPEC-001.md` (Phase 1 scope; many items now also true for what we shipped beyond)
- `.cairndex/rules/operating-rules.md`
