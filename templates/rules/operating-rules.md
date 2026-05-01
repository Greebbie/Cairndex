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

- Reciprocal links (e.g., `superseded_by` when you set `supersedes`) — auto-written
- `updated` frontmatter timestamp — auto-refreshed on save (UTC date)
- Files with `status: removed`, `archived`, or `abandoned` — moved to `archive/`
- Index `Recent changes` section (between `<!-- cairndex:recent-changes:start/end -->` markers in `index.md`) — auto-regenerated
- Session note at session end — auto-written by Claude Code's Stop hook (with tool-call counts when transcript is available)
- Validation + auto-fix on every save — auto-run by Claude Code's PostToolUse hook

> **When does automation run?** Either (a) `cairndex ui` is running in this repo, or (b) Claude Code's `PostToolUse`/`Stop` hooks are configured (they are, by default, after `cairndex init`). If neither, run `cairndex doctor --fix` manually after a session.

## Hard rules

- Do not silently overwrite the body of an immutable file (decisions, sessions, changes, intents, insights).
- Do not delete files outside `archive/`. To remove an entry, set its `status: removed` and let the watcher archive it.
- Do not write IDs that don't match the project's `config.yaml` ID format.
- Do not write outside `.cairndex/**` to satisfy a cairndex requirement; cairndex changes only its own files.
