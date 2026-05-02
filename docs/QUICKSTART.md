# Cairndex Quickstart

Five minutes from clone to a working AI memory layer wired into Claude Code.

## What is Cairndex?

A **vault** for your AI coding sessions. Specs, decisions, plans, sessions, and
insights live as typed Markdown files outside any single repo. Your AI agent
reads the vault before it works and proposes updates after — every change goes
through a review inbox before it lands in canonical memory. The vault survives
chat-window resets and is human-readable / Git-versionable.

## Prerequisites

| Tool | Minimum | Why |
|---|---|---|
| Node.js | 20.0+ | Runtime for the CLI, Fastify server, and Vite build |
| pnpm | 9.0+ | Package manager (the launcher script will activate it via corepack if missing) |

Optional but recommended:

- **Claude Code CLI** ([install guide](https://docs.claude.com/en/docs/claude-code/setup)) — the agent that reads/writes the vault.

## Two install paths

Path 1 is the recommended one for end users: build the exe once, double-click forever.

### Path 1 — Build a single .exe, then double-click (recommended)

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
pnpm -F cairndex package:sea
```

This produces **`Cairndex.exe`** at the repo root (so it's visible right next
to the README), plus a portable `packages/cli/dist-sea/` bundle for
redistribution. The exe is ~84 MB with Node.js embedded — zero runtime
dependencies.

- **Just want to run it locally?** Double-click `Cairndex.exe` at the repo
  root. It locates `packages/web/dist/` and `templates/` automatically.
- **Want to share/move it?** Take the whole `packages/cli/dist-sea/` folder
  (exe + sibling `web/` + sibling `templates/`) anywhere — USB stick,
  `~/Applications/`, etc. Keep the three siblings together; the exe finds
  resources by relative path.

Either way: double-click → server starts on http://localhost:7777 → browser
auto-opens to the GUI.

> Once we publish releases, you'll be able to skip the build step and grab
> a pre-built bundle from
> [GitHub Releases](https://github.com/Greebbie/Cairndex/releases).

### Path 2 — Global CLI install (for advanced users; future)

> Note: `@cairndex/cli` is not yet published to the npm registry. Use Path 1
> until the first release.

```bash
pnpm add -g @cairndex/cli   # or:  npm i -g @cairndex/cli
cairndex ui
```

> Hacking on Cairndex itself? Re-run `pnpm -F cairndex package:sea` after
> source changes to refresh `Cairndex.exe`, or run `node packages/cli/bin/cairndex ui`
> directly against your live source build for fastest iteration (no SEA repack).

## First-run wizard

When the GUI opens with no projects registered, you're walked through three steps:

1. **Choose a vault folder.** Created if it doesn't exist. A typical path is
   `C:\Users\<you>\CairndexVault` on Windows or `~/CairndexVault` elsewhere.
   The vault is your home for project memory across all repos.

2. **Register a code repo as a project.** Point at the repo on disk; Cairndex
   creates `<vault>/projects/<id>/` and writes a one-line `.cairndex-project.yaml`
   pointer file inside the repo. The pointer is metadata, not memory — the
   vault stays the source of truth.

3. **Run doctor.** Validates your vault structure, suggests safe auto-fixes,
   then drops you on the project Dashboard.

## Wiring Claude Code

In a repo that has been registered as a project, run once:

```bash
cairndex init
```

This injects three things into `.claude/settings.json` (idempotent — safe to
re-run, only `cairndex-managed` entries are replaced):

- **PostToolUse hook** — after every Write/Edit, runs `cairndex doctor --fix`
  to validate vault state and apply safe auto-fixes.
- **Stop hook** — at session end, writes a session note + sweeps for stale
  proposals.
- **MCP server registration** — exposes the four `cairndex` tools to the agent:
  `context_pack`, `propose_memory_update`, `update_living_doc`, `inbox_list`.

Open Claude Code in that repo. The agent now reads your vault on entry and
proposes updates to your inbox without manual prompting.

## Where things live

```
<repo>/
├── .cairndex-project.yaml      ← pointer to vault (not memory itself)
├── .claude/settings.json       ← hooks + MCP wiring (cairndex-managed)
└── ...

<vault>/
├── vault.yaml
├── projects/<project-id>/
│   ├── project.yaml
│   ├── index.md
│   ├── goals/  intents/  specs/  decisions/  plans/  tasks/
│   ├── sessions/  changes/  insights/  questions/
│   ├── indexes/
│   └── inbox/proposed-memory-updates/
└── shared/                     ← cross-project rules, templates, insights
```

## Daily flow

1. Open Claude Code in your wired repo. Agent's first turn already has the
   active task and pending proposals via the SessionStart bootstrap.
2. Code as usual. Hooks capture session activity in the background.
3. At session end, review proposals in the GUI's *Review Inbox* page (or
   `cairndex inbox list` from the terminal). Accept the ones that should
   land in canonical memory; reject the rest.
4. Run `cairndex status` any time you want a one-screen summary of phase /
   active task / pending proposal count / vault health.

## Settings & user preferences

The GUI's *Settings* page edits two scopes:

- **Project (vault scope)** — `<vault>/projects/<id>/.../config.yaml` and
  `rules/`. Shared with anyone using this vault.
- **User (machine scope)** — `~/.cairndex/preferences.yaml`. Personal — your
  UI theme, default freshness threshold, custom rules.

Project rules win where they overlap with user prefs — the vault is the
source of truth for everyone working off it.

## Common issues

- **`pnpm install` fails on first run.** Make sure you have Node 20+. If
  you're behind a corporate proxy, set `npm_config_proxy` and
  `npm_config_https_proxy` before running.
- **GUI doesn't auto-open the browser.** Visit `http://localhost:7777`
  manually. The server runs even when the browser doesn't open.
- **Claude Code doesn't see the MCP tools.** Confirm `.claude/settings.json`
  has an `mcpServers.cairndex` block, then restart Claude Code (it loads MCP
  servers at session start).
- **Windows path issues.** Use forward slashes (`C:/Users/you/CairndexVault`)
  in vault.yaml and pointer files; backslashes work in CLI args but YAML
  prefers forward slashes.

## Where to next

- [README.md](../README.md) — project overview and architecture
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development setup
- `cairndex --help` — full CLI reference
