---
id: ADR-002
title: Central vault is the canonical memory store
status: accepted
tags: [architecture, vault, migration]
created: 2026-05-02
updated: 2026-05-02
provenance:
  created_by: codex
  session: 2026-05-02-central-vault-correction
  confidence: 0.95
verification:
  run: "User confirmed central Obsidian-style vault direction in conversation on 2026-05-02"
links:
  - type: updates
    target: SPEC-001
---

# ADR-002: Central vault is the canonical memory store

## Context

Earlier Cairndex plans and code assumed one `.cairndex/` folder inside each
code repository, plus a global `~/.cairndex/` registry for the GUI. The user
clarified on 2026-05-02 that this is not the desired product shape.

The target is like Obsidian: one central vault folder contains all projects.
Agents should read and write project memory from that central place, which makes
migration, backup, and cross-project workflows simple.

## Decision

The canonical Cairndex memory store is a central vault:

```txt
CairndexVault/
  vault.yaml
  projects/
    <project-id>/
      project.yaml
      index.md
      goals/
      intents/
      specs/
      decisions/
      plans/
      tasks/
      sessions/
      changes/
      insights/
      questions/
      indexes/
      inbox/
  shared/
  indexes/
```

A code repo may keep:

- `.cairndex-project.yaml` as a machine-local or committed pointer to
  `{ vaultRoot, projectId }`.
- `CLAUDE.md` as a derived agent surface generated from the vault.
- Legacy `.cairndex/` only as compatibility and import source.

Repo-local `.cairndex/` is not the target canonical store.

## Consequences

- Core path APIs must move from `repoRoot -> repoRoot/.cairndex` to a project
  reference such as `{ vaultRoot, projectId, projectRoot, repoRoot? }`.
- CLI commands need explicit `--vault <path> --project <id>` options. `cwd`
  can remain a fallback only when it resolves through `.cairndex-project.yaml`
  or a vault-local project manifest.
- The GUI should open one vault and switch between project namespaces inside
  `projects/`, instead of primarily reading a global list of repo paths.
- Server routes should resolve project IDs within the opened vault.
- Agent guidance should point durable writes to
  `projects/<project-id>/inbox/proposed-memory-updates/`.
- Existing per-repo vaults need an import command that copies their memory into
  `CairndexVault/projects/<project-id>/`.
- There should not be two live canonical memory sources kept in sync.

## Follow-up Work

- Add `vault.yaml` and `project.yaml` loaders.
- Add a `ProjectRef` abstraction in `packages/core`.
- Add `cairndex vault init`, `cairndex project register`, and
  `cairndex project import-repo-vault`.
- Update `doctor`, `context`, `emit claude-md`, hooks, server, and web routes to
  accept central vault project references.
- Add central-vault fixtures and migration tests.
