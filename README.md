# cairndex

> Persistent, reviewable project memory for AI coding agents.

Cairndex is a structured memory layer for AI coding sessions. Your project's
specs, decisions, plans, sessions, and insights live as typed Markdown in one
central vault. AI coding agents (Claude Code, Cursor, and others) read this
memory before they start work and propose updates after — every change goes
through a review inbox before it lands. Memory survives the chat window, is
human-readable, and version-controllable.

## Quickstart

**Prereqs:** Node 20+ and pnpm 9+ (only needed to *build* the exe; the resulting
exe has Node baked in). See [docs/QUICKSTART.md](./docs/QUICKSTART.md) for the
full 5-minute walkthrough including Claude Code wiring.

### 1. Build the single .exe and double-click it (recommended)

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
pnpm -F cairndex package:sea
```

When the build finishes, **`Cairndex.exe`** sits right at the repo root next to
this README. Double-click it → server starts on http://localhost:7777 →
browser opens to the GUI. That's the whole story.

The exe is ~84 MB with Node.js embedded — zero runtime dependencies. It finds
its web assets in `packages/web/dist/` and its vault templates in `templates/`
(both already in the repo), so the root copy works as soon as it's built.

For redistribution, the same build also produces `packages/cli/dist-sea/`
containing a self-contained portable bundle (`Cairndex.exe` + sibling `web/`
and `templates/` folders). Drop that whole folder onto a USB stick or
`~/Applications/` — keep the three siblings together — and double-click the
exe to run.

> Future: pre-built binaries from [Releases](https://github.com/Greebbie/Cairndex/releases)
> so you can skip the build step entirely.

### 2. Global CLI install (after npm publish; not yet)

```bash
pnpm add -g @cairndex/cli   # or: npm i -g @cairndex/cli
cairndex ui
```

Your browser opens to a 3-step wizard:

1. **Choose a vault folder** — created if it doesn't exist (e.g. `~/CairndexVault`).
2. **Register a code repo** as your first project.
3. **Run doctor** to verify, then land on the project Dashboard.

After that, `cairndex init` inside the repo wires Claude Code (hooks +
MCP server) automatically. No config files, no schemas to learn first.

## How memory is organized

A vault holds many projects, each as a tree of typed Markdown:

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

A repo can opt-in via a one-line pointer file:

```yaml
# <repo>/.cairndex-project.yaml
vault: "C:/Users/<you>/CairndexVault"
project: "my-app"
```

That pointer is not memory — the vault is. Repo-local `.cairndex/` folders
remain supported for migration but new projects should live in the central vault.

### Node types

| Folder | Role | Mutability |
|---|---|---|
| `goals/` | Project north stars | living |
| `intents/` | User asks captured verbatim | immutable |
| `specs/` | What we are building | living + history |
| `decisions/` | ADR-style decisions | immutable once accepted |
| `plans/` | How we will build | living, supersedable |
| `tasks/` | Current work breakdown | living |
| `sessions/` | Per-session work narrative | immutable |
| `changes/` | Project event stream | append-only |
| `insights/` | Lessons; promotable to shared memory | append-only |
| `questions/` | Open uncertainties | living, status-tracked |

Three load-bearing properties:

- **Typed edges** in frontmatter (`links: [{type: supersedes, target: ADR-002}]`)
  plus `[[wikilinks]]` in body.
- **Provenance**: every node records who created it, in which session, with what
  confidence.
- **Verification-bound completion**: marking `status: done` requires a
  `verification` block, enforced by `cairndex doctor`.

## How agents interact

The contract is simple and enforceable:

1. Resolve the current repo to `{ vaultRoot, projectId }`.
2. Read `projects/<id>/index.md`, `shared/rules/`, and a generated context pack.
3. Propose durable memory changes by writing to
   `projects/<id>/inbox/proposed-memory-updates/`. The user accepts or rejects
   from the GUI's Review Inbox or via `cairndex inbox`.
4. Never edit canonical memory directly.

Agents can read the vault three ways:

- **Files**: grep / read the Markdown directly.
- **CLAUDE.md region**: an auto-generated `<!-- cairndex:start -->` block in
  your repo's `CLAUDE.md` summarising current phase, active task, and pointers.
- **MCP**: `cairndex mcp` exposes `context_pack`, `propose_memory_update`,
  `inbox_list`, and resources over stdio.

## CLI reference

The GUI wizard wraps these — you rarely need to type them, but they're there:

```bash
cairndex vault init <path>                              # create a central vault
cairndex project register --vault <path> --project <id> --repo <repo-path>
cairndex project import-repo-vault ...                  # migrate from legacy .cairndex/

cairndex ui [--vault <path>] [--port 7777]              # launch GUI + watcher
cairndex context [task] [--vault <path>] [--project <id>]
cairndex doctor [--vault <path>] [--project <id>] [--fix]
cairndex emit claude-md ...                             # regenerate CLAUDE.md region
cairndex inbox list | accept <id> | reject <id> | propose ...
cairndex sweep                                          # consolidate + archive (idempotent)
cairndex mcp                                            # MCP server over stdio
```

## Status

**v0.2** — central vault model is GA. The CLI, web GUI, MCP server, watcher,
review inbox, context packs, and doctor all run against the central layout.
345+ tests, end-to-end smoke verified via headless browser.

What's next:

- Desktop packaging (Tauri) so users get a double-click install instead of
  `npm i -g`.
- Cross-vault search and read-only project sharing.
- Richer graph views in the GUI.

## Architecture

`cairndex` is a pnpm monorepo:

```
packages/
├── core/      @cairndex/core    # vault primitives, validation, MCP, indexes
├── cli/       @cairndex/cli     # the cairndex command
├── server/    @cairndex/server  # Fastify API + SSE
└── web/       @cairndex/web     # React GUI
```

Build with `pnpm -r build`, test with `pnpm test`. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for development setup.

## License

MIT. See [LICENSE](./LICENSE).
