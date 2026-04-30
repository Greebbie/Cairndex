# cairndex

> A lightweight, Markdown-native project memory system for AI-assisted coding.

`cairndex` gives Claude Code (and other coding agents) a persistent, structured, human-readable memory layer that lives **inside each repository**, plus a multi-project GUI that manages all your cairndex-enabled projects from one place — like Obsidian for your AI coding workflow.

**Status**: 🚧 Early development. See [`docs/superpowers/specs/`](./docs/superpowers/specs/) and [`docs/superpowers/plans/`](./docs/superpowers/plans/) for the full design and implementation roadmap.

---

## Why

AI coding loses context across sessions. Important information scatters across chat history, README, git commits, ad-hoc notes, issue trackers, and unstated assumptions. Agents forget requirements, repeat past mistakes, and silently overwrite decisions.

cairndex fixes this with a **typed, structured, append-or-evolve** memory model that agents read before work and update after work — without ever needing to invoke explicit CLI commands. Agents just write Markdown; cairndex's watcher and Claude Code hooks keep everything consistent.

## How it works

```
┌────────────────────────────────────┐
│       GUI (cairndex ui)            │
│  Local web app — browse, manage    │
│  all registered projects in one    │
│  place. Read/Light-edit only;      │
│  Markdown body editing is          │
│  delegated to your editor.         │
└──────────────┬─────────────────────┘
               │
   ┌───────────┴───────────┐
   ▼                       ▼
┌──────────────┐   ┌──────────────────┐
│ ~/.cairndex/ │   │ <repo>/.cairndex/│
│  (global)    │   │   (per project)  │
│ • registry   │   │  • index.md      │
│ • shared     │   │  • specs/        │
│   templates  │   │  • decisions/    │
│ • shared     │   │  • plans/        │
│   rules      │   │  • sessions/     │
│ • promoted   │   │  • changes/      │
│   insights   │   │  • insights/     │
└──────────────┘   │  • questions/    │
                   │  • tasks/        │
                   │  • goals/        │
                   │  • intents/      │
                   └──────────────────┘
```

Three layers, clean responsibilities:

- **Per-repo `.cairndex/`** is fully self-contained. Committed to git. Clone-and-go.
  Agents only ever read this layer at runtime.
- **Global `~/.cairndex/`** holds a registry of your projects plus shared templates, rules, and promoted insights. Read only by `cairndex init` (copies defaults into a new project) and `cairndex sync` (pulls explicit updates).
- **GUI** is a local web app launched via `cairndex ui` — browse all your projects, see timelines, edit settings via forms, no Markdown editor needed.

## Memory model (2026 form)

Each project's `.cairndex/` is a **knowledge graph in Markdown**. 10 typed node folders:

| Folder | Role | Mutability |
|---|---|---|
| `goals/` | Project north stars | living |
| `intents/` | User asks captured verbatim | immutable |
| `specs/` | What we're building | living + `## History` append |
| `decisions/` | ADR-style decisions | immutable once accepted |
| `plans/` | How we'll build | living, supersedable |
| `tasks/` | Current work breakdown | living |
| `sessions/` | Per-session work narrative | immutable |
| `changes/` | Project event stream | append-only |
| `insights/` | Lessons; promotable to global | append-only |
| `questions/` | Open uncertainties | living, status-tracked |

Three first-class concepts in frontmatter:

- **Typed edges** — `links: [{type: supersedes, target: ADR-002}]`. Plus `[[wikilinks]]` in body.
- **Provenance** — every node knows who created it, in which session, with what confidence.
- **Verification-bound completion** — claiming `status: done` requires a `verification` block (test/commit/run); enforced by `cairndex doctor`.

And a **phase tracker** in `index.md`: `discovering → specifying → planning → implementing → reviewing → shipping`.

See [`docs/superpowers/specs/2026-04-30-cairndex-design.md`](./docs/superpowers/specs/2026-04-30-cairndex-design.md) for the full design.

## Automation-first CLI (4 commands)

```bash
cairndex init        # Bootstrap a vault in the current repo
cairndex ui          # Launch the local web GUI + watcher
cairndex sync        # Sync shared templates/rules between global and project
cairndex doctor      # Validate vault, show status, --fix safe issues
```

Plus `cairndex insight promote/pull <ID>` for cross-project knowledge sharing.

**Most operations are automatic**:
- Agents write Markdown directly using their existing Edit/Write tools.
- The watcher (started by `cairndex ui`) and Claude Code's `PostToolUse` / `Stop` hooks (configured by `cairndex init`) handle validation, normalization, reciprocal links, archive-on-status, and auto-session capture.
- You don't need to remember to "log a session" — the Stop hook does it.
- You don't need to "fix the index" — the watcher rebuilds it.

## Project structure

```
cairndex/
  packages/
    core/      @cairndex/core   — vault read/write, schema, validate, sync
    cli/       @cairndex/cli    — `cairndex` binary
    server/    @cairndex/server — Fastify HTTP + SSE
    web/       @cairndex/web    — React app (Vite)
  templates/                    — default operating-rules + 10 node templates
  docs/
    superpowers/
      specs/   — design specs
      plans/   — implementation plans
```

This is a pnpm monorepo. Build with `pnpm build`, test with `pnpm test`.

## Roadmap

- **v0.1 (MVP)** — All 4 CLI commands, full vault + GUI (read-focused), Claude Code hooks integration. See [`docs/superpowers/plans/`](./docs/superpowers/plans/).
- **v0.2** — Graph view (react-flow), search/filter UI, "new entry" forms.
- **v0.3** — `cairndex serve --public` for read-only team sharing.
- **v1.0** — Tauri desktop app, MCP server exposing core API as tools, optional embeddings cache.

## License

MIT — see [LICENSE](./LICENSE).

## A note on the name

`cairn` (a stone marker on a path) + `index` (a structured pointer to content) — an index of project markers: specs, decisions, sessions, changes, plans, insights. Pronounced like "cairn-decks" or "cairn-dex" — your call.
