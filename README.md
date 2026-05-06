# Cairndex

> A handoff cockpit for AI coding agents. Cairndex keeps project memory in a
> structured Markdown vault, summarizes it for humans in a dashboard, and feeds
> the next agent enough context to continue without drifting.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-orange.svg)](https://pnpm.io/)

Cairndex is built for vibe coding and long-running AI-assisted projects where
chat history is not enough. It gives you an Obsidian-style vault for specs,
decisions, plans, tasks, sessions, insights, and change history, then connects
that vault to Codex and Claude Code.

The core idea is simple:

```text
AI session
  -> Cairndex hooks record what changed
  -> Markdown vault stays organized
  -> Dashboard summarizes the state for humans
  -> Next agent starts from AGENTS.md / bootstrap / context pack
```

## Why Cairndex

AI coding agents reset. They lose context, repeat discovery work, miss prior
decisions, and leave important knowledge buried in chat transcripts.

Cairndex moves durable project memory out of the chat window and into a
reviewable, structured vault. The agent can read the current task and context
before it starts, and Cairndex can automatically record each session when it
ends. Humans keep the final say through the dashboard and inbox.

## What it does

- **Organized Markdown vault.** Stores project memory as typed Markdown files:
  specs, decisions, plans, tasks, sessions, changes, insights, and questions.
- **Automatic session organization.** Agent hooks record each session, capture
  changed files, refresh the resume surface, and keep the context pack current.
- **Human dashboard.** Shows active work, next action, handoff readiness,
  recent activity, memory health, inbox proposals, and agent integration status.
- **Browseable memory.** The vault remains plain Markdown, so it can be read in
  the GUI, searched with normal tools, versioned with Git, or opened in an
  editor like Obsidian.
- **Agent handoff surface.** Codex reads `AGENTS.md`; Claude Code reads
  `CLAUDE.md` and MCP. Both can start with the current project state instead of
  rediscovering it from scratch.
- **Review inbox.** Agents propose durable memory changes; humans accept or
  reject what becomes canonical.
- **Health checks.** `cairndex doctor` validates links, provenance, completion
  rules, stale context, and other memory integrity issues.

## Current status

Cairndex is pre-release and actively dogfooded on this repository. The core
loop is usable:

- central vault registration
- dashboard and browse views
- Codex and Claude Code wiring
- automatic session notes and last-turn summaries
- context pack generation
- inbox proposal workflow
- handoff readiness checks

Published packages and pre-built GitHub release binaries are not available yet.
For now, build and run from source.

## Quickstart

### Requirements

- Node.js 20 or newer
- pnpm 9 or newer

### Install and build

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
```

### Launch the GUI from source

```bash
node packages/cli/bin/cairndex ui
```

The local server starts on `http://localhost:7777` and opens the browser by
default. On first run, the GUI walks you through:

1. choosing or creating a vault folder;
2. registering a code repository as a project;
3. validating the vault with `cairndex doctor`.

See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for a fuller walkthrough.

## Connect an agent

Run this inside a registered repository:

```bash
node packages/cli/bin/cairndex init
```

That command wires agent hooks for the current project. In the GUI, the
Dashboard and Settings pages also show an **Agent Integration** panel where you
can connect or refresh Codex and Claude Code wiring.

### Codex

Cairndex writes:

- `.codex/hooks.json` for session start, edit, and stop hooks;
- `AGENTS.md` with a generated Cairndex handoff block.

At session start, Codex sees the current phase, active task, next action,
pending memory, and handoff rules. At session end, hooks organize the turn into
the vault.

### Claude Code

Cairndex writes:

- `.claude/settings.json` hooks;
- an MCP server entry for `cairndex mcp`;
- `CLAUDE.md` with the same Cairndex handoff block.

Claude Code can also call MCP tools for context packs, inbox proposals, and
workflow state.

## Vault layout

A central vault can hold many projects:

```text
CairndexVault/
  vault.yaml
  projects/
    my-app/
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
        context-packs/
        memory-health.json
        active-context.json
      inbox/
        proposed-memory-updates/
      state/
        resume.md
        resume.json
  shared/
    rules/
```

The code repository points at its vault project with:

```yaml
# <repo>/.cairndex-project.yaml
vault: "C:/Users/you/Documents/CairndexVault"
project: "my-app"
```

The pointer is metadata. The vault is the source of truth for project memory.

## Daily workflow

1. Open a wired repo in Codex or Claude Code.
2. Start working normally.
3. Cairndex hooks keep the vault clean while the agent works.
4. At session end, Cairndex records a session note, updates the latest turn
   summary, refreshes the resume, and rebuilds stale context packs.
5. Review the Dashboard and Inbox to decide what should become durable memory.
6. The next agent starts from the updated handoff surface.

For high-quality handoff, close out important sessions with:

```bash
node packages/cli/bin/cairndex wrap
```

The close-out flow captures what finished, what was learned, and where the next
agent should continue.

## CLI reference

```bash
# Launch the GUI
cairndex ui [--vault <path>] [--port 7777]

# Project setup
cairndex vault init <path>
cairndex project register --vault <path> --project <id> --repo <repo>
cairndex init

# Context and health
cairndex status
cairndex doctor [--fix]
cairndex context [task]
cairndex resume

# Workflow
cairndex task switch <TASK-id>
cairndex task complete [<TASK-id>]
cairndex phase set <name>
cairndex wrap

# Memory review
cairndex inbox list
cairndex inbox accept <PROP-id>
cairndex inbox reject <PROP-id>
```

When running from source, prefix commands with:

```bash
node packages/cli/bin/cairndex <command>
```

## Architecture

This repository is a pnpm monorepo:

```text
packages/
  core/      vault model, validation, indexes, context packs, hooks
  cli/       cairndex command line interface
  server/    Fastify API, SSE, static GUI hosting
  web/       React dashboard and browse UI
templates/   default vault templates and rules
docs/        user-facing and development documentation
```

Useful development commands:

```bash
pnpm install
pnpm -r build
pnpm typecheck
pnpm test
pnpm lint
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution
guidelines.

## Roadmap

- pre-built GitHub release binaries;
- stronger semantic session summaries;
- richer browse and graph views;
- cross-project search;
- more agent adapters beyond Codex and Claude Code;
- live multi-agent progress views.

## License

[MIT](./LICENSE)
