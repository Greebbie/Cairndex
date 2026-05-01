# cairndex — Design Spec

**Date**: 2026-04-30
**Status**: Superseded architecture note
**Owner**: Greebbie (p65420201@gmail.com)

---

> **Superseded on 2026-05-02:** This document describes the original per-repo
> `.cairndex/` architecture. The accepted product direction is now a central
> Obsidian-style vault containing all projects under `projects/<project-id>/`.
> See `2026-05-02-cairndex-central-vault-architecture.md`.
>
> The memory model, node taxonomy, validation rules, and agent-surface ideas in
> this document still apply. The storage topology does not: repo-local
> `.cairndex/` is now a migration source / compatibility mode, not the target
> source of truth.

## 1. Overview

`cairndex` is a lightweight, local, Markdown-native project memory system designed for AI-assisted coding workflows. It gives Claude Code (and other coding agents) a persistent, structured, human-readable memory layer that lives inside each repository, plus a multi-project GUI that manages all your cairndex-enabled projects from one place.

**Name**: `cairn` (path-marker stone) + `index` — an index of project markers: specs, decisions, sessions, changes, plans, insights.

### Problem

AI coding loses context across sessions. Important information scatters across chat history, README, git commits, ad-hoc notes, issue trackers, and unstated assumptions. Agents forget requirements, repeat past mistakes, and silently overwrite decisions.

### Goals

- Give agents a **typed, structured, append-or-evolve** memory model they can read before work and update after work.
- Stay **Markdown-native, local-first, Git-friendly, human-readable**.
- Allow **multi-project management** through a single GUI (Obsidian-style: one app, many independent vaults).
- Be **safe by default**: never silently overwrite history; preserve a per-entry timeline plus a project-wide event log.
- Be **automation-first**: agents write Markdown directly; cairndex's watcher/hooks keep the vault consistent without explicit CLI commands.
- Stay **MCP-ready** so the same core can later be exposed as MCP tools without redesign.

---

## 2. Architecture

Three layers, with clean responsibilities:

```
┌─────────────────────────────────────────────────────────┐
│                   GUI (cairndex ui)                      │
│   Local web app — browse/manage all registered projects │
│   Frontend: React + Vite. Backend: Fastify.             │
│   Launched via: cairndex ui                             │
└────────────────────────┬────────────────────────────────┘
                         │ reads / writes
                         ▼
┌──────────────────────────────────┐  ┌────────────────────┐
│      ~/.cairndex/  (global)       │  │ <repo>/.cairndex/  │
│  ─────────────────────────       │  │  (per project)      │
│  config.yaml                      │  │  config.yaml        │
│  projects.json   ← registry       │  │  index.md           │
│  shared/                          │  │  goals/  intents/   │
│    rules/operating-rules.md       │  │  specs/  decisions/ │
│    templates/*.md                 │  │  plans/  tasks/     │
│    insights/   ← promoted only    │  │  sessions/ changes/ │
│                                   │  │  insights/ questions│
│  ↓ copied (not symlinked)         │  │  context/ rules/    │
│    on `cairndex init`             │  │  templates/         │
└──────────────────────────────────┘  └────────────────────┘
```

### Self-containment principle

**Every per-project `.cairndex/` is fully self-contained**: committed to git, clone-and-go, zero dependency on global state at agent runtime. The global layer is read **only** during:

1. `cairndex init` — copies `shared/` defaults into the new project
2. `cairndex sync` — explicit, user-initiated, copies updates from global to project (or vice versa for promote)
3. `cairndex ui` — lists registered projects and opens them

Agents (Claude Code, etc.) **never read `~/.cairndex/`**. Only `<repo>/.cairndex/`. This guarantees:
- `git clone` produces a working vault
- CI machines and teammates' machines see the same rules as the author
- "Why is the agent reading this rule?" always has one answer: it's in the repo

---

## 3. Memory Model (2026 form)

The vault is a **knowledge graph in Markdown**. Each node is one `.md` file; relationships are typed edges in frontmatter plus wikilinks in body.

### Node taxonomy (10 types)

| Folder | Role | Mutability | Concept |
|---|---|---|---|
| `goals/` | Project north stars: why it exists, long-term outcomes | living | product vision |
| `intents/` | User/stakeholder asks captured verbatim, unprocessed | immutable | raw intent capture |
| `specs/` | What we're building (refinable) | living + `## History` append | spec-driven development |
| `decisions/` | ADR-style architecture/product decisions | immutable once `status: accepted` | ADR |
| `plans/` | How we'll build (multi-step, supersedable) | living, can be superseded | plan artifacts |
| `tasks/` | Current work breakdown linked to plans/specs | living | agentic task graph |
| `sessions/` | Per-session work narrative | immutable | work log |
| `changes/` | Project-level event stream (chronological) | append-only | event-sourced changelog |
| `insights/` | Lessons/patterns extracted from sessions; promotable to global | append-only | continuous learning |
| `questions/` | Open uncertainties; archived (with answer link) on resolve | living, status-tracked | open questions |

### Living vs immutable

- **Living** files (`goals`, `specs`, `plans`, `tasks`, `questions`, `index.md`) have a top "Current Statement" section that may be edited and a bottom `## History` section that is append-only.
- **Immutable** files (`decisions`, `sessions`, `changes`, `intents`, `insights`) are never edited after creation. To change a decision, create a new ADR that supersedes the old one.

### First-class concepts (in frontmatter)

**1. Typed edges** — relationships are not just "supersedes":

```yaml
links:
  - { type: implements,        target: SPEC-001 }
  - { type: implements_goal,   target: GOAL-002 }
  - { type: supersedes,        target: ADR-002 }
  - { type: superseded_by,     target: ADR-009 }
  - { type: validates,         target: SPEC-001, evidence: src/auth.test.ts }
  - { type: blocks,            target: TASK-005 }
  - { type: blocked_by,        target: QUESTION-003 }
  - { type: touches,           target: SPEC-001 }   # session → spec
  - { type: planned_in,        target: PLAN-007 }
  - { type: sources,           target: SESSION-2026-04-30-1530 }  # insight provenance
```

Body wikilinks `[[SPEC-001]]` are also recognized; the watcher computes a **backlink index** on every save and exposes it via the GUI.

**2. Provenance** on every node:

```yaml
provenance:
  created_by: claude-opus-4-7
  session: 2026-04-30-1530
  evidence: [src/auth/login.ts:42, run-log:build-789]
  confidence: 0.85
  last_verified: 2026-04-30
```

`doctor` warns on missing or stale provenance. `confidence < 0.5` or `last_verified > 60d` is highlighted in the GUI.

**3. Verification-bound completion claims**:

```yaml
status: done
verification:
  test: src/auth/login.test.ts
  commit: abc123de
  run: build-789
```

A file with `status: done` and no `verification` block fails `doctor`. This enforces the 2026 "evidence before assertion" principle.

**4. Phase tracking** (in `index.md` frontmatter):

```yaml
phase: implementing       # discovering | specifying | planning | implementing | reviewing | shipping
phase_since: 2026-04-30
next_action: Run integration tests for SPEC-001
blocked_by: [QUESTION-003]
```

The GUI Dashboard shows the phase as a tracker pill, and `cairndex doctor` flags incoherence (e.g., `phase: implementing` but `plans/` is empty).

### Concrete spec example

```yaml
---
id: SPEC-001
title: User can log in with email
status: active            # active | superseded | removed | done
tags: [auth, security]
phase: implementing
created: 2026-04-30
updated: 2026-04-30
provenance:
  created_by: claude-opus-4-7
  session: 2026-04-30-1530
  confidence: 0.92
links:
  - { type: implements_goal, target: GOAL-002 }
  - { type: blocked_by,      target: QUESTION-003 }
  - { type: planned_in,      target: PLAN-007 }
---

## Current Statement
Users can log in with email + password. Sessions valid 90 days.

## Rationale
...

## Open Questions
- [[QUESTION-003]] — Magic-link variant?

## History
- 2026-04-30 — Created. Initial scope: email-only.
```

### Cross-project insight promotion

`~/.cairndex/shared/insights/` holds insights promoted from individual projects. Flow:

```
project: insights/INS-005-postgres-tx-pattern.md
  ↓  cairndex insight promote INS-005   (manual; or GUI button)
~/.cairndex/shared/insights/INS-005-postgres-tx-pattern.md
  ↓  cairndex init in a new project (asks: inherit this insight? y/n)
new-project: insights/INS-005-postgres-tx-pattern.md  (inherited)
```

Project's promoted insight gets `promoted_to_global: true` in frontmatter. This becomes the user's evolving cross-project knowledge base.

---

## 4. Vault Layouts

### Per-project (`<repo>/.cairndex/`)

```
.cairndex/
  config.yaml                       # local override of folder names, ID prefixes, required fields
  index.md                          # entry point: phase, active focus, recent changes
  goals/
    README.md
    GOAL-001-...md
  intents/
    README.md
    INT-001-...md
  specs/
    README.md
    SPEC-001-...md
  decisions/
    README.md
    ADR-001-...md
  plans/
    README.md
    PLAN-001-...md
  tasks/
    current.md                      # active task list (living)
    backlog.md                      # backlog (living)
    TASK-001-...md                  # individual task files (when needed)
  sessions/
    README.md
    2026-04-30-1530-...md
  changes/
    changelog.md                    # append-only project event log
  insights/
    README.md
    INS-001-...md
  questions/
    README.md
    QUESTION-001-...md
  context/
    overview.md
    architecture.md
    data-model.md
    api-map.md
    glossary.md
  rules/
    operating-rules.md              # how agents use this vault (copied from global at init)
  templates/                        # local templates (copied from global at init)
    spec.md
    decision.md
    plan.md
    task.md
    session.md
    insight.md
    question.md
    change.md
    goal.md
    intent.md
  archive/                          # auto-populated when files reach status: archived/removed
```

### Global (`~/.cairndex/`)

```
~/.cairndex/
  config.yaml                       # global defaults; GUI preferences
  projects.json                     # registered projects (path, alias, last_opened)
  shared/
    rules/
      operating-rules.md            # canonical rules cairndex ships with
    templates/                      # default templates for all 10 types
      spec.md
      decision.md
      ...
    insights/                       # cross-project promoted insights
      INS-005-postgres-tx-pattern.md
```

### `config.yaml` schema

```yaml
schemaVersion: 1

folders:
  goals: goals
  intents: intents
  specs: specs                      # rename to "requirements" if user prefers
  decisions: decisions              # or "adr"
  plans: plans
  tasks: tasks
  sessions: sessions
  changes: changes
  insights: insights
  questions: questions
  context: context

ids:
  goal: GOAL
  intent: INT
  spec: SPEC                        # or "REQ", "FR"
  decision: ADR
  plan: PLAN
  task: TASK
  session: yyyy-MM-dd-HHmm          # date format, not sequential
  insight: INS
  question: QUESTION
  change: CHG

required_frontmatter:
  spec:     [id, title, status, created, updated]
  decision: [id, title, status, created]
  session:  [id, date, summary]
  # ... per type

verification_required_for_status: [done, accepted]
freshness_warn_days: 30
```

Project-level `config.yaml` may override any subset; missing fields fall back to global defaults at write time (resolved into project config on `init`, then static).

---

## 5. Inheritance & Sync

**Model**: copy-at-init, explicit sync. **Not** live cascading.

### `cairndex init` flow

1. Validate cwd is a git repo (warn if not, ask to proceed)
2. Create `<repo>/.cairndex/` folder skeleton
3. Copy `~/.cairndex/shared/` → `<repo>/.cairndex/{rules,templates}/`
4. (Optional) prompt to inherit specific global insights → copy selected to `<repo>/.cairndex/insights/`
5. Generate initial `index.md`, `tasks/current.md`, `tasks/backlog.md`, `changes/changelog.md`
6. Write `<repo>/.cairndex/config.yaml` with `schemaVersion` and any project-level overrides
7. Append/replace cairndex section in `<repo>/CLAUDE.md` (idempotent via markers)
8. Register in `~/.cairndex/projects.json` with `{ path, alias, registered: <ts> }`
9. Write a sync baseline file `<repo>/.cairndex/.sync-baseline.json` recording hash of each copied file

### `cairndex sync` flow (three-way merge)

For each file under `rules/`, `templates/` (and selectively `insights/` flagged inherited):

```
       global   project   baseline
         |        |          |
         └────────┴──────────┘
                  │
            three-way diff
                  │
       ┌──────────┼──────────┐
       │          │          │
   only global  only project  both changed
       │          │          │
   fast-fwd      skip       conflict file
   (apply       (preserve   written to
    update)     local)      .sync-conflicts/
```

- **Only global changed** → fast-forward, update local copy and baseline
- **Only project changed** → skip (preserve user's local edits)
- **Both changed** → write conflict marker file under `.cairndex/.sync-conflicts/<path>.md` containing both versions; user resolves manually then re-runs sync

`sync` is **never automatic** — destructive across the global/project boundary. GUI exposes a "Sync from global" button that runs the same logic.

### `cairndex insight promote <ID>` flow

1. Validate INS-XXX exists and is `status: stable` (insights start `status: draft`)
2. Copy file to `~/.cairndex/shared/insights/`
3. Set `promoted_to_global: true` in project copy
4. Append change event to project changelog
5. Future `cairndex init` offers to inherit this insight

`cairndex insight pull <ID>` is the inverse: pull an existing global insight into the current project (e.g., a project initialized before the insight was promoted).

---

## 6. Automation Layer (the heart of the design)

cairndex is **automation-first**: agents write Markdown directly using their existing Edit/Write tools, and cairndex keeps the vault consistent in the background. The CLI surface is intentionally tiny.

### Three automation mechanisms

**(a) Watcher** — runs while `cairndex ui` is active

Built on chokidar. Triggers on any change under `<repo>/.cairndex/**`:

| Trigger | Action |
|---|---|
| Any write/edit | Run validate on changed files; surface errors in GUI |
| Frontmatter style drift | Auto-normalize: sort fields, lowercase tags, kebab-case-ify |
| `links` change | Auto-write reciprocal links (e.g., A.supersedes:B implies B.superseded_by:A) |
| File status → `archived`/`removed` | Move file to `.cairndex/archive/`, append event to changelog |
| File renamed (ID changed) | Update all references in other files to new ID |
| New file in tracked folder | Compute backlinks; refresh index.md "Recent changes" section |
| Save | Update file's `updated` frontmatter timestamp |

The watcher is **idempotent** and **debounced** (250ms) to avoid edit storms.

**(b) Claude Code hooks** — for headless agent runs without GUI

`cairndex init` writes (or extends) `<repo>/.claude/settings.json`. Conceptual shape (final field names align with the Claude Code hooks spec at implementation time):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "cairndex doctor --silent --fix --scope changed --filter-path .cairndex/"
      }
    ],
    "Stop": [
      { "command": "cairndex doctor --silent --auto-session" }
    ]
  }
}
```

The path filter is enforced inside `cairndex doctor` (via `--filter-path`) rather than relying on a declarative `if:` clause, so the integration works regardless of which hook fields Claude Code currently supports.

- **PostToolUse**: any agent edit to `.cairndex/**` triggers `doctor --fix --scope changed` (validates only the changed file plus its references; auto-fixes safe issues like missing `updated` timestamp, normalizes tags).
- **Stop** (session end): runs `doctor --auto-session`, which scans the just-finished session's tool-call history and writes a `sessions/YYYY-MM-DD-HHMM.md` draft with frontmatter populated and a body summarizing what files were touched and which specs/decisions were affected. The agent (or human) can refine later, but the session is captured even if everyone forgets.

If the user does not use Claude Code hooks (other agent harnesses), the watcher provides the same coverage when `cairndex ui` is running.

**(c) Auto-session capture details**

Stop hook receives the session transcript via Claude Code's hook stdin. cairndex extracts:
- Files touched under `.cairndex/**` and elsewhere
- Specs/decisions/tasks referenced (by ID matches)
- Tool-call summary (counts of Edit/Write/Bash)
- A trivial first-line "Summary: <one sentence>" placeholder for the agent/user to fill

Output: `<repo>/.cairndex/sessions/2026-04-30-1530.md` with frontmatter:

```yaml
id: 2026-04-30-1530
date: 2026-04-30
summary: "TODO: one-line summary"
provenance:
  created_by: cairndex-auto-session
  session: 2026-04-30-1530
links:
  - { type: touches, target: SPEC-001 }
  - { type: touches, target: ADR-005 }
```

### Delete and modify, automated

| User/agent does | cairndex auto-handles |
|---|---|
| Write new spec | validate → fill provenance → update index → compute backlinks |
| Edit spec status → `removed` | move file to `archive/`, append changelog event |
| Add `links: [{type: supersedes, target: ADR-002}]` | update ADR-002 with `superseded_by` (reciprocal) |
| Delete a file via `rm` | warn about orphaned references; append deletion event to changelog |
| Rename a file (ID change) | rewrite all references to new ID across the vault |

Agent only expresses intent (write/edit/delete files); cairndex preserves global consistency.

---

## 7. CLI Surface (4 top-level commands + `insight` namespace)

```bash
cairndex init                     # bootstrap: create .cairndex/, register globally, integrate CLAUDE.md
cairndex ui [--port 7777]         # launch local web GUI + watcher (dev-time daemon)
cairndex sync                     # explicit cross-global sync (destructive; never automatic)
cairndex doctor [--fix] [--silent] [--scope changed|all] [--auto-session]
                                  # diagnose: validate + suggestions + state report; --fix auto-resolves safe issues

# Cross-project insight management (also exposed as GUI buttons)
cairndex insight promote <ID>     # project insight → ~/.cairndex/shared/insights/
cairndex insight pull <ID>        # global insight → current project
```

That's it. **No `add`, `link`, `show`, `list`, `status`, `validate`** — those are subsumed by:

- **agent writes Markdown directly** (uses templates from `templates/`); watcher/hooks normalize
- **GUI** for browsing/searching/filtering visually
- **`doctor`** for one-stop validation + status snapshot

`cairndex doctor` output example:

```
$ cairndex doctor
✓ Schema valid (28 files)
⚠ 2 stale claims: SPEC-005, SPEC-012 marked done with no verification
⚠ Index out of sync: 3 recent changes not reflected in index.md
✗ ADR-007 references SPEC-099 which doesn't exist

Run with --fix to auto-resolve 1 fixable issue.
Phase: implementing (since 2026-04-30, 7 days)
Active focus: SPEC-001, SPEC-014
```

`--scope changed` (used by hooks) only checks files changed in the current run, dramatically faster.

---

## 8. GUI Surface (`cairndex ui`)

Local web app served at `http://localhost:7777` (configurable). Pure read-and-light-edit; **no Markdown body editing in MVP** (use Obsidian / VS Code / any editor).

### MVP views

| View | Purpose |
|---|---|
| **Project list** (sidebar) | Loads `~/.cairndex/projects.json`; click to switch active project; "+ Add" registers a new path |
| **Dashboard** | Renders current project's `index.md` + phase tracker pill + 3 most recent sessions + open questions count + `doctor` status badge |
| **Browse** | Tree view by node type (goals/specs/decisions/...); click file → File view |
| **File view** | Rendered Markdown with syntax highlighting; right rail shows: frontmatter as readable card, typed links (outgoing), backlinks (incoming, computed by watcher), provenance & verification |
| **Timeline** | Chronological feed merging `changes/changelog.md` events + spec/decision status changes + sessions; filterable by type and date |
| **Settings** | Two tabs: project `config.yaml` (folders/IDs/required fields/verification rules) and global `~/.cairndex/config.yaml` (defaults, GUI preferences); edited via forms (react-hook-form + zod); writes back to YAML files |

### Deferred to v0.2 / v0.3

- **Graph view** (react-flow / visx): visualize supersede chains, plan→spec→task graphs
- **"New entry" forms**: create SPEC/ADR/PLAN with frontmatter form and template body
- **Search & filter** UI: full-text + tag + status filters
- **Read-only public share**: `cairndex serve --public` to expose vault to teammates

### Tech

- React 18, Vite, TailwindCSS, shadcn/ui
- react-markdown + remark-gfm + rehype-highlight + custom remark plugin for `[[wikilinks]]`
- react-hook-form + zod for settings forms
- TanStack Query for backend calls
- Dark mode default; light mode toggle

---

## 9. CLAUDE.md Integration

`cairndex init` writes an idempotent block, never touches user content:

```md
<!-- cairndex:start v1 -->
## cairndex Project Memory

This repository uses cairndex as a structured Markdown memory vault.

### Before starting meaningful work

1. Read `.cairndex/index.md` (entry point: phase, active focus, recent changes)
2. Read `.cairndex/rules/operating-rules.md` (how to interact with this vault)
3. Read relevant files under specs/, decisions/, plans/, tasks/, questions/

### After meaningful work

The cairndex watcher and PostToolUse/Stop hooks handle most maintenance automatically:
- Validation, normalization, backlinks: automatic on file save
- Session note: automatic on session end (Stop hook)
- Reciprocal links: automatic when you add a `links` entry

You should still:
- Update `.cairndex/specs/` when product behavior or scope changes (use `## History` section to log change)
- Create a new ADR when a technical decision changes (mark old ADR as `superseded`)
- Set `status: done` (or `status: accepted` for ADRs) only with a `verification` field pointing to test/run/commit
- Resolve `.cairndex/questions/` items as they're answered

### Treat `.cairndex/` as durable memory, not scratch notes

Do not silently rewrite history. Use the typed-edge model (`supersedes`, `superseded_by`) instead.

<!-- cairndex:end -->
```

### Idempotent merge logic

| State | Action |
|---|---|
| No `CLAUDE.md` | Create with just the cairndex block |
| `CLAUDE.md` exists, no markers | Append the cairndex block at end |
| `CLAUDE.md` exists, markers present | Replace content between markers |

User-authored content outside the markers is **never** modified.

---

## 10. Validation Rules (`cairndex doctor`)

| Severity | Rule |
|---|---|
| **error** | Required frontmatter field missing (per `config.required_frontmatter`) |
| **error** | Filename ID does not match frontmatter `id` |
| **error** | `links.target`, `supersedes`, `superseded_by` references non-existent ID |
| **error** | `status: done` (or any in `verification_required_for_status`) lacks `verification` block |
| **error** | Bidirectional inconsistency: A.supersedes:B but B.superseded_by != A |
| **error** | `id` collision across files |
| **warn** | `provenance` block missing or incomplete |
| **warn** | `last_verified` older than `freshness_warn_days` and `status: active` |
| **warn** | Phase incoherence: `index.phase: implementing` but `plans/` is empty |
| **warn** | Tags not kebab-case |
| **warn** | File outside known folders (extension type not in `config.folders`) |
| **info** | `confidence < 0.5` on a node referenced by an active spec/plan |
| **auto-fix (`--fix`)** | Set/refresh `updated` timestamp on edited files |
| **auto-fix** | Normalize tags to kebab-case |
| **auto-fix** | Add reciprocal `superseded_by` / `blocked_by` links |
| **auto-fix** | Sort frontmatter fields into canonical order |

`--scope changed` runs only against files changed since the last hook invocation (tracked via mtime + a hash file). `--scope all` runs full vault.

---

## 11. Tech Stack & Repo Layout

### Stack

- **Language**: TypeScript 5.x
- **Runtime**: Node 20+
- **Workspace**: pnpm workspaces
- **CLI args**: commander
- **HTTP**: Fastify
- **Frontend**: React 18, Vite, TailwindCSS, shadcn/ui
- **Markdown**: gray-matter (frontmatter), remark + unified, react-markdown + remark-gfm, rehype-highlight; custom remark plugin for `[[wikilinks]]`
- **Schema**: zod
- **File watch**: chokidar
- **Logging**: pino
- **Testing**: vitest, Playwright
- **Lint/format**: biome
- **Build**: tsup (cli/core/server), Vite (web)

### Repo layout

```
cairndex/
  package.json                       # workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  biome.json
  packages/
    cli/                             # `cairndex` binary
      bin/cairndex                   # node shim → dist/bin.js
      src/
        bin.ts                       # commander entry, dispatches commands
        commands/
          init.ts
          ui.ts
          sync.ts
          doctor.ts
        utils/
          paths.ts
          prompts.ts                 # interactive prompts (insight inheritance, etc.)
      package.json
      tsconfig.json
    core/                            # shared by cli, server, hooks
      src/
        vault.ts                     # read/write vault files
        schema.ts                    # zod schemas per type
        config.ts                    # config loader (project + global, merged)
        ids.ts                       # ID generation, parsing
        validate.ts                  # validation engine, rules
        sync.ts                      # three-way merge for global<->project
        watcher.ts                   # chokidar wrapper, debounced events
        templates.ts                 # template loading and rendering
        backlinks.ts                 # reverse-link index computation
        normalize.ts                 # frontmatter normalization (auto-fix)
        archive.ts                   # status: archived → move to archive/
        autoSession.ts               # Stop hook session note generator
        claudeMd.ts                  # idempotent CLAUDE.md merge
        registry.ts                  # ~/.cairndex/projects.json management
      package.json
    server/                          # local HTTP server (embedded by ui)
      src/
        index.ts                     # Fastify app factory
        routes/
          projects.ts                # GET /api/projects (registry)
          vault.ts                   # GET/PATCH /api/vault/:project/:type/:id
          config.ts                  # GET/PATCH /api/config/{project,global}
          changes.ts                 # GET /api/changes/:project (timeline)
          doctor.ts                  # POST /api/doctor/:project
        watcher.ts                   # broadcast file changes to web via SSE
      package.json
    web/                             # React app
      index.html
      vite.config.ts
      src/
        main.tsx
        App.tsx
        router.tsx
        pages/
          Dashboard.tsx
          Browse.tsx
          File.tsx
          Timeline.tsx
          Settings.tsx
        components/
          PhaseTracker.tsx
          FileTree.tsx
          FrontmatterCard.tsx
          BacklinksPanel.tsx
          MarkdownView.tsx
        lib/
          api.ts                     # TanStack Query hooks
          wikilinks.ts               # remark plugin
      package.json
  templates/                         # default shared/ contents shipped with cairndex
    rules/operating-rules.md
    templates/spec.md
    templates/decision.md
    templates/plan.md
    templates/task.md
    templates/session.md
    templates/insight.md
    templates/question.md
    templates/change.md
    templates/goal.md
    templates/intent.md
  tests/
    fixtures/
      sample-vault/                  # realistic vault for integration tests
    cli.test.ts
    validate.test.ts
    sync.test.ts
    autoSession.test.ts
    e2e/
      gui-smoke.spec.ts
  README.md
  LICENSE
```

### Distribution

- Published as `cairndex` on npm; `npm i -g cairndex` provides the CLI globally
- The `web/` build is bundled into `packages/cli/dist/web/` and served by the embedded Fastify server when `cairndex ui` runs
- No native binaries; pure JS package

---

## 12. Testing Strategy

| Layer | Framework | Coverage target |
|---|---|---|
| **Unit** (core) | vitest | 80%: schema, validate rules, ID gen, frontmatter parse, sync diff, normalize, backlinks, archive, autoSession, claudeMd |
| **Integration** (cli) | vitest + tmp dirs | 70%: each command end-to-end against a tmp project, including hooks and watcher behavior |
| **Smoke E2E** (web) | Playwright | smoke only: launch ui, switch projects, navigate views, edit settings, verify file write |

### Fixture vault

`tests/fixtures/sample-vault/` contains a realistic `.cairndex/` with examples of every node type, several inter-references, a supersede chain, an open question, and a session that touched specs. Tests load this fixture into a tmp dir and assert behavior.

### Test discipline

- Integration tests must not hit the user's real `~/.cairndex/`; use `CAIRNDEX_HOME` env var override
- Watcher tests use chokidar's polling mode for determinism in CI
- Hook tests simulate Claude Code's stdin payload format

---

## 13. MVP Scope

### In MVP (v0.1)

- CLI: `init`, `ui`, `sync`, `doctor`, `insight promote`, `insight pull`
- Per-project `.cairndex/` vault with all 10 node types
- Global `~/.cairndex/` with shared rules, templates, insights, project registry
- Copy-at-init inheritance with explicit `sync`
- Insight promote/pull (CLI + GUI button)
- Watcher with auto-validate, auto-normalize, reciprocal links, archive-on-status
- Claude Code PostToolUse + Stop hooks (auto-session capture)
- Idempotent CLAUDE.md integration
- GUI: Project list, Dashboard, Browse, File view, Timeline, Settings
- `cairndex doctor` validation engine with all rules in §10
- Templates for all 10 node types
- 80%/70%/smoke test coverage as per §12

### Out of MVP (explicit)

- Embeddings / semantic search
- LLM-driven memory consolidation or summarization
- MCP server implementation (only MCP-ready API shape, not running server)
- ACP adapter
- Tauri / Electron desktop app
- VS Code extension
- Obsidian plugin
- GitHub Issues/PR sync
- Jira/Linear sync
- Multi-user real-time collaborative sync
- Authentication / encryption
- Cross-project queries (only insight promote/pull)
- Graph view in GUI
- "New entry" forms in GUI (templates exist; agent writes the file)
- Full-text search UI
- Markdown body editing in GUI

---

## 14. Future Roadmap

- **v0.2** — GUI graph view (react-flow), search/filter UI, "new entry" forms, `cairndex config set <key> <value>` CLI
- **v0.3** — `cairndex serve --public` for read-only team sharing, remote vault registries
- **v1.0** — Tauri desktop app (reuses 99% of web frontend), MCP server exposing core API as tools, optional embeddings cache for semantic recall
- **Beyond** — ACP adapter (if editor-agent protocol integration becomes necessary), VS Code extension as alternative to web GUI, optional Obsidian plugin for vault-mode usage

---

## 15. Success Criteria

The MVP is successful if and only if:

1. `cairndex init` produces a working, validated `.cairndex/` in any clean repo and registers it globally.
2. After init, Claude Code reads `CLAUDE.md` and correctly understands how to interact with cairndex (verified by manual end-to-end run).
3. Agent writes Markdown directly using templates; PostToolUse hook keeps the vault valid without explicit CLI calls.
4. Stop hook produces a non-empty session note covering files touched and IDs referenced; this works without any agent-side instruction beyond reading the operating rules.
5. `cairndex ui` launches and a human can: switch projects, read the dashboard, browse files, see backlinks, and edit settings — without opening a Markdown editor.
6. `cairndex doctor` catches every error category in §10 on a deliberately broken fixture.
7. `cairndex sync` correctly handles all three diff branches (only-global, only-project, both-changed) on a fixture with each case.
8. `cairndex insight promote` + a fresh `cairndex init` in another project successfully inherits the promoted insight.
9. Test coverage meets §12 targets and CI passes on Linux + macOS + Windows.
10. A naive user can `npm i -g cairndex && cairndex init && cairndex ui` and have a working memory system in under 5 minutes.

---

## Appendix A — Operating Rules (default content shipped in `shared/rules/operating-rules.md`)

```md
# cairndex Operating Rules

You are interacting with a cairndex Markdown memory vault. Follow these rules.

## Before any meaningful work

1. Read `.cairndex/index.md` to learn the current phase, active focus, and recent changes.
2. Read this file (`rules/operating-rules.md`) — you are reading it now.
3. Read the files referenced under "Read next" in `index.md`.
4. Read any `questions/QUESTION-*` with `status: open` that block your task.

## When making changes

### Writing new entries

- Use templates from `.cairndex/templates/<type>.md` as the starting point.
- Generate the next ID per the project's `config.yaml.ids` rule for that type:
  - Sequential prefix types (SPEC, ADR, PLAN, TASK, INS, GOAL, INT, QUESTION, CHG): read the highest existing number in the relevant folder and increment.
  - Date-format types (sessions default to `yyyy-MM-dd-HHmm`): use the current local timestamp.
- Always populate `provenance` with your model name, the current session ID, and your confidence.
- Use typed `links` for relationships (e.g., a session that touches a spec gets `links: [{type: touches, target: SPEC-XXX}]`).
- Use `[[ID]]` wikilinks in body text for cross-references.

### Modifying existing entries

- **Decisions** are immutable once `status: accepted`. To change a decision, create a new ADR with `links: [{type: supersedes, target: ADR-OLD}]` and set the old ADR's `status: superseded`.
- **Specs / Plans / Goals / Questions** are living. Edit the "Current Statement" section and append a one-line entry to the bottom `## History` section.
- Never delete history. Status transitions to `archived` or `removed` are tracked; the watcher moves files to `archive/` automatically.

### Completion claims

- Setting `status: done` (or `status: accepted` for ADRs) requires a `verification` block with at least one of: `test`, `commit`, `run`. Without it, `cairndex doctor` will fail.

## Automatic behaviors (you do not need to do these)

- Reciprocal links (e.g., `superseded_by` when you set `supersedes`) — auto-written by watcher
- `updated` frontmatter timestamp — auto-refreshed on save
- Index `Recent changes` section — auto-regenerated
- Session note at session end — auto-written by Stop hook
- Validation on every save — auto-run by PostToolUse hook

## Hard rules

- Do not silently overwrite the body of an immutable file (decisions, sessions, changes, intents, insights).
- Do not delete files outside `archive/`. To remove an entry, set its `status: removed` and let the watcher archive it.
- Do not write IDs that don't match the project's `config.yaml` ID format.
- Do not write outside `.cairndex/**` to satisfy a cairndex requirement; cairndex changes only its own files.
```

---

## Appendix B — Open Questions Captured During Brainstorm

None remaining at end of brainstorm. All major design questions resolved:

- ~~Tech stack: TS/Node + npm distribution~~ ✓ resolved
- ~~Frontmatter & ID scheme~~ ✓ resolved (filename ID + mirrored frontmatter)
- ~~Mutability discipline~~ ✓ resolved (living vs immutable, append-only History)
- ~~Configurability~~ ✓ resolved (3 layers: edit MD / config.yaml / extension folders)
- ~~GUI necessity & scope~~ ✓ resolved (in MVP, read-focused, settings forms only, no MD body edit)
- ~~Multi-project model~~ ✓ resolved (Obsidian-style: global registry + per-repo vaults, no live cascading)
- ~~Memory model sophistication~~ ✓ resolved (10 node types + typed edges + provenance + verification + phase)
- ~~CLI surface~~ ✓ resolved (4 commands; rest via automation)
- ~~Cross-project sharing~~ ✓ resolved (insight promote/pull, copy-at-init inheritance)
