# Cairndex

> **A second brain for your AI coding agent.** Persistent, reviewable project
> memory that survives the chat window.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg)](https://pnpm.io/)

Think **Structured Markdown vault** + **Claude Code / MCP** + the
**Building a Second Brain** methodology, fused for AI-assisted coding.

Your project's goals, specs, decisions, plans, tasks, sessions, and insights
live as structured Markdown files in a central vault. AI agents (Claude Code,
Cursor, …) read this memory before they start work and propose updates after.
Every change passes through a review inbox before it lands — the agent
proposes, the human accepts.

```
┌──────────────┐    reads    ┌──────────────┐   proposes    ┌──────────────┐
│  AI agent    │────────────▶│ Cairndex     │──────────────▶│ Review inbox │
│ (Claude Code)│             │ vault        │               │  (you)       │
└──────────────┘             │ (Markdown)   │◀──────────────└──────────────┘
        ▲                    └──────────────┘    accepted
        │                            │
        └─── context pack (MCP) ─────┘
```

## Why

LLM coding agents have goldfish memory. Every new session starts from zero,
re-reads the same files, re-asks the same clarifying questions, and makes
decisions the team has already made twice. Chat transcripts are not memory:
they are a hostile place to store project knowledge.

Cairndex flips it: durable memory lives outside the chat, structured as the
kind of artifacts engineers already write — specs, ADRs, plans, tasks,
session notes — but with typed cross-links, provenance, and verification
rules a machine can enforce. The agent reads it, the agent proposes changes
to it, and a human stays in the loop on what becomes canonical.

## Table of contents

- [Features](#features)
- [Quickstart](#quickstart)
- [Vault layout](#vault-layout)
- [Agent integration](#agent-integration)
- [CLI reference](#cli-reference)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Typed Markdown vault** — goals, intents, specs, decisions, plans, tasks,
  sessions, changes, insights, and questions. Each node has frontmatter,
  typed cross-links, and lives in plain `.md` files you can `grep` and commit.
- **Inbox-first writes** — agents propose, humans accept or reject. Canonical
  memory is never edited directly, so AI changes are always reviewable and
  reversible.
- **Claude Code / MCP integration** — first-class MCP server exposing
  `context_pack`, `propose_memory_update`, `inbox_list`, and workflow tools.
  One `cairndex init` wires hooks + MCP into `.claude/settings.json`.
- **Web dashboard** — project state, review inbox, context pack composer,
  plan progress, and a chronological implementation timeline. Quick-action
  buttons for switching tasks and advancing phase without dropping to a CLI.
- **Token-budgeted context packs** — prioritized assembly so the agent reads
  the right slice of memory under a configurable token budget.
- **Health doctor** — validation rules across the vault: staleness, broken
  links, missing provenance, verification-bound completion. Runs on every
  edit via PostToolUse hook.

## Quickstart

### Requirements

- Node.js 20 or newer
- pnpm 9 or newer

### Build and run

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
pnpm -F cairndex package:sea
```

The build produces `Cairndex.exe` at the repo root with Node.js embedded
(approximately 84 MB, zero runtime dependencies). Launch the GUI by
double-clicking the executable; the server starts on `http://localhost:7777`
and the browser opens automatically.

For redistribution, the same build emits a portable bundle under
`packages/cli/dist-sea/`. Copy the folder anywhere — keep the executable with
its sibling `web/` and `templates/` directories.

### First run

The GUI walks through three steps the first time it opens:

1. Choose a vault folder. It is created if it does not exist (typically
   `~/CairndexVault`).
2. Register a code repository as a project.
3. Run `cairndex doctor` to validate the vault.

The wizard ends on the project dashboard.

### Wire Claude Code

Inside any registered project's repo:

```bash
cairndex init
```

This injects three idempotent entries into `.claude/settings.json`:

- A `PostToolUse` hook that runs `cairndex doctor --fix` after every
  Write/Edit.
- A `Stop` hook that records the session note and refreshes the context pack.
- An MCP server registration so the agent can call Cairndex tools directly.

For the deeper walkthrough see [docs/QUICKSTART.md](./docs/QUICKSTART.md).

## Vault layout

A vault holds many projects. Each project is a tree of typed Markdown files:

```
CairndexVault/
├── vault.yaml
├── projects/
│   └── my-app/
│       ├── project.yaml
│       ├── index.md
│       ├── goals/  intents/  specs/  decisions/  plans/  tasks/
│       ├── sessions/  changes/  insights/  questions/
│       ├── indexes/
│       └── inbox/proposed-memory-updates/
├── shared/                # cross-project rules, templates, insights
└── indexes/               # vault-wide rollups
```

A repo opts in via a one-line pointer file:

```yaml
# <repo>/.cairndex-project.yaml
vault: "C:/Users/<you>/CairndexVault"
project: "my-app"
```

The pointer is metadata; the vault is memory.

### Node types

| Folder       | Role                                  | Mutability               |
| ------------ | ------------------------------------- | ------------------------ |
| `goals/`     | Project north stars                   | living                   |
| `intents/`   | User asks captured verbatim           | immutable                |
| `specs/`     | What we are building                  | living, history-tracked  |
| `decisions/` | ADR-style decisions                   | immutable once accepted  |
| `plans/`     | How we will build                     | living, supersedable     |
| `tasks/`     | Current work breakdown                | living                   |
| `sessions/`  | Per-session work narrative            | immutable                |
| `changes/`   | Project event stream                  | append-only              |
| `insights/`  | Lessons; promotable to shared memory  | append-only              |
| `questions/` | Open uncertainties                    | living, status-tracked   |

Every node carries:

- **Typed edges** — `links: [{type: supersedes, target: ADR-002}]` plus
  `[[wikilinks]]` in body content.
- **Provenance** — who created the node, in which session, with what
  confidence.
- **Verification-bound completion** — marking `status: done` requires a
  `verification` block; `cairndex doctor` enforces it.

## Agent integration

The contract between Cairndex and any agent is small and enforceable:

1. Resolve the current repo to `{ vaultRoot, projectId }`.
2. Read `projects/<id>/index.md`, `shared/rules/`, and a generated context
   pack.
3. Propose memory changes by writing to
   `projects/<id>/inbox/proposed-memory-updates/`.
4. The user accepts or rejects from the GUI's *Review Inbox* page or via
   `cairndex inbox`.
5. Never edit canonical memory directly.

Agents read the vault three ways:

- **Files.** Grep or read the Markdown directly.
- **CLAUDE.md region.** An auto-generated `<!-- cairndex:start -->` block in
  the repo's `CLAUDE.md` summarising current phase, active task, and pointers.
- **MCP.** `cairndex mcp` exposes tools and resources over stdio for
  protocol-aware agents.

## CLI reference

```bash
# Vault and project setup
cairndex vault init <path>
cairndex project register --vault <path> --project <id> --repo <repo>
cairndex project import-repo-vault ...

# Run the GUI
cairndex ui [--vault <path>] [--port 7777]

# Daily usage
cairndex context [task] [--vault <path>] [--project <id>]
cairndex doctor [--fix]
cairndex inbox list | accept <id> | reject <id> | propose ...
cairndex task switch <id>
cairndex task complete [<id>]
cairndex phase set <name>
cairndex sweep
cairndex mcp
```

## Architecture

`cairndex` is a pnpm monorepo:

```
packages/
├── core/      @cairndex/core    # vault primitives, validation, MCP, indexes
├── cli/       @cairndex/cli     # the cairndex command
├── server/    @cairndex/server  # Fastify API + SSE
└── web/       @cairndex/web     # React GUI
```

Build with `pnpm -r build`. Test with `pnpm test`. Type-check with
`pnpm typecheck`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full
development setup.

## Roadmap

- Pre-built binaries published to GitHub Releases.
- Desktop packaging (Tauri) for a one-click install.
- Cross-vault search and read-only project sharing.
- Richer graph views and timeline visualisations in the GUI.

## Contributing

Issues and pull requests are welcome. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding style, and
testing conventions.

## License

[MIT](./LICENSE)
