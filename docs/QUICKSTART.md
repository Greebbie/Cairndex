# Cairndex Quickstart

This guide gets you from a fresh clone to a running Cairndex dashboard wired to
an AI coding agent.

## 1. Prerequisites

Install:

- Node.js 20 or newer
- pnpm 9 or newer

Optional agent integrations:

- Codex
- Claude Code

## 2. Build from source

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
```

## 3. Start the GUI

```bash
node packages/cli/bin/cairndex ui
```

The GUI starts at:

```text
http://localhost:7777
```

The browser opens automatically unless you pass `--no-open`.

## 4. Create or choose a vault

On first run, the GUI asks for a vault folder. A typical Windows path is:

```text
C:/Users/you/Documents/CairndexVault
```

The vault is where Cairndex stores durable project memory. It is separate from
your code repository so one vault can manage many projects.

## 5. Register a project

Choose a code repository. Cairndex creates:

```text
<vault>/projects/<project-id>/
```

and writes this pointer file into the repo:

```yaml
# <repo>/.cairndex-project.yaml
vault: "C:/Users/you/Documents/CairndexVault"
project: "my-app"
```

The pointer lets CLI commands and agent hooks resolve the correct project.

## 6. Connect Codex or Claude Code

From inside the registered repo, run:

```bash
node packages/cli/bin/cairndex init
```

You can also use the **Agent Integration** panel in the Dashboard or Settings
page.

### Codex wiring

Cairndex creates or refreshes:

```text
.codex/hooks.json
AGENTS.md
```

Codex receives the current project handoff at session start and Cairndex
organizes the session when the turn ends.

### Claude Code wiring

Cairndex creates or refreshes:

```text
.claude/settings.json
CLAUDE.md
```

The settings file includes hooks and an MCP server entry.

## 7. Work normally

Once connected, the loop is:

1. Start a Codex or Claude Code session in the repo.
2. Work normally.
3. Cairndex hooks validate memory while files change.
4. At the end of the session, Cairndex writes a session note, updates the
   last-turn summary, refreshes the resume, and rebuilds stale context packs.
5. Open the Dashboard to review project state, memory health, handoff readiness,
   and pending inbox proposals.

For important sessions, run:

```bash
node packages/cli/bin/cairndex wrap
```

This captures a human-readable close-out: what finished, what was learned, and
where the next agent should continue.

## Useful commands

```bash
# Open the GUI
node packages/cli/bin/cairndex ui --vault "C:/Users/you/Documents/CairndexVault"

# Check project status
node packages/cli/bin/cairndex status

# Validate and apply safe fixes
node packages/cli/bin/cairndex doctor --fix

# Build a context pack for the current task
node packages/cli/bin/cairndex context "current task"

# Print the current handoff resume
node packages/cli/bin/cairndex resume

# Review proposed memory updates
node packages/cli/bin/cairndex inbox list
```

## Troubleshooting

### The GUI cannot find the web build

Run:

```bash
pnpm -r build
node packages/cli/bin/cairndex ui
```

### The browser does not open

Visit the URL manually:

```text
http://localhost:7777
```

### The agent does not see Cairndex context

Check that the project has been connected:

```bash
node packages/cli/bin/cairndex init
```

Then restart the agent session. Hooks and MCP entries are loaded at session
start.

### Handoff is blocked

Open the Dashboard and read the Handoff Readiness panel. Common blockers are:

- latest session lacks a close-out narrative;
- context pack is stale;
- active task or next action is missing;
- inbox has unresolved memory proposals.

Run `cairndex wrap` for the latest important session, then refresh the
dashboard.
