---
id: PLAN-001
title: Central vault migration
status: active
created: 2026-05-02
updated: 2026-05-02
provenance:
  created_by: codex
  session: 2026-05-02-central-vault-correction
  confidence: 0.9
links:
  - type: implements
    target: ADR-002
  - type: updates
    target: SPEC-001
---

# PLAN-001: Central vault migration

## Current Plan

Move Cairndex from the legacy per-repo `.cairndex/` implementation toward the
accepted central vault architecture without breaking existing local workflows.

### Phase A: Project reference abstraction

- Add a `ProjectRef` type: `{ vaultRoot, projectId, projectRoot, repoRoot? }`.
- Add central path helpers for `CairndexVault/projects/<project-id>/...`.
- Keep legacy wrappers so current `repoRoot` callers still work during
  migration.
- Add resolver support for `.cairndex-project.yaml`.

### Phase B: Vault and project manifests

- Add `vault.yaml` schema and loader.
- Add `project.yaml` schema and loader under each project namespace.
- Replace primary reliance on global `~/.cairndex/projects.json` with
  vault-local project manifests.
- Keep `projects.json` only as compatibility or "recent vaults" state.

### Phase C: CLI pivot

- Add `cairndex vault init <path>`.
- Add `cairndex project register --vault <path> --project <id> --repo <repo>`.
- Add `cairndex project import-repo-vault --vault <path> --project <id> --repo <repo>`.
- Update `doctor`, `context`, `emit claude-md`, `inbox`, `archive`, `sweep`,
  `consolidate`, `mcp`, and `sync` to resolve `{ vaultRoot, projectId }`.

### Phase D: Server and UI pivot

- Change `cairndex ui` to accept `--vault <path>` and serve projects from
  `projects/*/project.yaml`.
- Change server project resolution from alias-to-repo-path to
  vault/project-root resolution.
- Update dashboard, browse, pack, inbox, insight, config, changes, doctor, and
  sync routes to operate on project roots inside the central vault.
- Update web copy that still says `grep .cairndex/`.

### Phase E: Agent integration

- Generate or update `.cairndex-project.yaml` in code repos.
- Generate `CLAUDE.md` as a derived agent surface that points to the central
  vault project.
- Change Claude hooks to pass `--vault <path> --project <id>` and filter
  central-vault project paths.

### Phase F: Tests and migration safety

- Add central-vault fixtures with at least two projects.
- Add import tests from a legacy repo-local `.cairndex/`.
- Keep existing per-repo tests green through compatibility wrappers until the
  migration is complete.
- Add e2e coverage for opening one vault and switching projects.

## History

- 2026-05-02: Created after user clarified central Obsidian-style vault as the
  target product shape.
