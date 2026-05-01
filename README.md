# cairndex

> A Markdown-native central vault for AI-assisted software work.

`cairndex` gives Claude Code and other coding agents a persistent, structured,
human-readable project memory layer. The target product model is **one central
vault folder that contains every project's memory**, like an Obsidian vault for
agent work.

**Status:** Early development. The current implementation still has legacy
per-repo `.cairndex/` behavior, but the accepted product direction is the
central vault model documented in
[`docs/superpowers/specs/`](./docs/superpowers/specs/).

## Why

AI coding loses context across sessions. Important information scatters across
chat history, README files, git commits, ad-hoc notes, issue trackers, and
unstated assumptions. Agents forget requirements, repeat past mistakes, and
silently overwrite decisions.

cairndex fixes this with a typed, structured, append-or-evolve memory model
that agents read before work and update after work. The durable source of truth
is the vault, not any single code repository.

## Target Storage Model

The user opens or migrates one Cairndex vault:

```txt
CairndexVault/
  vault.yaml
  projects/
    cairndex/
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
        proposed-memory-updates/
    another-project/
      project.yaml
      ...
  shared/
    rules/
    templates/
    insights/
    patterns/
  indexes/
    global-project-summary.json
    cross-project-health.json
    recent-activity.json
```

A code repository may contain a small pointer file:

```yaml
# <repo>/.cairndex-project.yaml
vault: "C:/Users/<user>/Documents/CairndexVault"
project: "cairndex"
```

That pointer is not memory. Repo-local `.cairndex/` folders are compatibility
and migration sources only. Derived agent surfaces such as `CLAUDE.md` can live
in the repo, but canonical specs, decisions, plans, sessions, indexes, context
packs, and inbox proposals live under `CairndexVault/projects/<project-id>/`.

## Memory Model

Each project namespace is a knowledge graph in Markdown. The core folders are:

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

Three first-class concepts are stored in frontmatter:

- **Typed edges:** `links: [{ type: supersedes, target: ADR-002 }]`, plus
  `[[wikilinks]]` in body.
- **Provenance:** every node records who created it, in which session, and with
  what confidence.
- **Verification-bound completion:** claiming `status: done` requires a
  `verification` block, enforced by `cairndex doctor`.

The project `index.md` carries the current phase:
`discovering -> specifying -> planning -> implementing -> reviewing -> shipping`.

## Target CLI Shape

```bash
cairndex vault init <path>
cairndex vault open <path>

cairndex project register --vault <path> --project <id> --repo <repo-path>
cairndex project import-repo-vault --vault <path> --project <id> --repo <repo-path>

cairndex context --vault <path> --project <id> "<task>"
cairndex doctor --vault <path> --project <id>
cairndex doctor --vault <path> --all
cairndex emit claude-md --vault <path> --project <id> --repo <repo-path>
cairndex ui --vault <path>
```

`cwd` can remain a convenience fallback only when it resolves through
`.cairndex-project.yaml` or a vault-local project manifest.

## Agent Contract

Agents should:

1. Resolve the current repo to `{ vaultRoot, projectId }`.
2. Read `projects/<project-id>/index.md`, `shared/rules/`, and the generated
   context pack.
3. Propose durable memory changes under
   `projects/<project-id>/inbox/proposed-memory-updates/` unless the user
   explicitly authorizes direct edits.
4. Never treat repo-local `.cairndex/` as canonical memory.

## Project Structure

```txt
cairndex/
  packages/
    core/      @cairndex/core
    cli/       @cairndex/cli
    server/    @cairndex/server
    web/       @cairndex/web
  templates/
  docs/
    superpowers/
      specs/
      plans/
```

This is a pnpm monorepo. Build with `pnpm build`, test with `pnpm test`.

## Roadmap

- **v0.1:** central vault primitives, project registration/import, context
  packs, doctor, GUI, and Claude Code agent surface.
- **v0.2:** review inbox processing, graph/search views, and stronger memory
  health.
- **v0.3:** MCP-facing resources/tools and read-only sharing.
- **v1.0:** desktop packaging and mature multi-project vault workflows.

## License

MIT. See [LICENSE](./LICENSE).

## Name

`cairn` is a path marker; `index` is a structured pointer to content.
`cairndex` is an index of project markers: specs, decisions, sessions, changes,
plans, insights, and questions.
