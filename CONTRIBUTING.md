# Contributing to Cairndex

Thanks for your interest in Cairndex. This document explains how to set up the
repository, run checks, and make changes that fit the project.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer

## Setup

```bash
git clone https://github.com/Greebbie/Cairndex.git
cd Cairndex
pnpm install
pnpm -r build
pnpm typecheck
pnpm test
```

## Repository layout

```text
packages/
  core/      vault model, validation, indexes, context packs, hooks
  cli/       cairndex command line interface
  server/    Fastify API, SSE, static GUI hosting
  web/       React dashboard and browse UI
templates/   default vault templates and rules
docs/        user-facing and development documentation
```

## Development workflow

1. Read the relevant package code before changing behavior.
2. Add or update tests for behavior changes.
3. Keep changes scoped to the feature or bug being addressed.
4. Run targeted tests while developing.
5. Before opening a pull request, run the standard checks below.

## Standard checks

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm -r build
```

For focused work, run package-level checks:

```bash
pnpm -F @cairndex/core typecheck
pnpm -F cairndex typecheck
pnpm -F @cairndex/server typecheck
pnpm -F @cairndex/web typecheck
```

## Coding style

- TypeScript is strict.
- Prefer small, direct modules over broad abstractions.
- Validate data at file, CLI, API, and agent boundaries.
- Keep canonical memory writes reviewable.
- Avoid unrelated formatting churn.
- Let Biome handle formatting.

## Testing guidelines

- Use Vitest for unit and integration tests.
- Use temporary directories for filesystem tests.
- Do not read or write the real user vault from tests.
- Set `CAIRNDEX_HOME` when tests need an isolated global config directory.
- Web tests should cover user-visible behavior, not implementation details.

## Memory model

Cairndex is itself managed as a Cairndex project during development. Durable
project memory lives in the configured vault, not in chat history. Agent-written
memory changes should flow through the inbox unless the code path is explicitly
responsible for generated state such as resume caches, indexes, or context
packs.

## Pull requests

Good pull requests include:

- a short description of the user-facing change;
- tests or a clear explanation of why tests were not added;
- notes on any migration or compatibility impact;
- screenshots for dashboard or browse UI changes.

Do not include generated local vault data unless it is intentionally part of the
change.

## Reporting issues

For bugs, include:

- operating system;
- Node and pnpm versions;
- the command or UI flow that failed;
- relevant `cairndex status` or `cairndex doctor` output;
- whether the project uses a central vault or legacy repo-local vault.

## License

By contributing, you agree that your contribution is licensed under the MIT
License. See [LICENSE](./LICENSE).
