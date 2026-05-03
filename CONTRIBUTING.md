# Contributing to cairndex

Thanks for your interest. This document explains how to set up the repo, the coding/testing conventions we follow, and how to propose changes.

## Setup

Requirements: **Node 20+** and **pnpm 9+**.

```bash
git clone https://github.com/<org>/cairndex.git
cd cairndex
pnpm install
pnpm test         # run all tests
pnpm typecheck    # strict TS
pnpm lint         # biome
pnpm build        # build all packages
```

## Repo layout

This is a pnpm monorepo:

```
packages/
  core/      @cairndex/core   — vault read/write, schema, validate, sync, watcher
  cli/       @cairndex/cli    — `cairndex` binary
  server/    @cairndex/server — Fastify HTTP + SSE
  web/       @cairndex/web    — React app
templates/   default rules + 10 node templates shipped with the package
docs/        public-facing user docs (e.g. QUICKSTART.md)
```

Each package has its own `package.json`, `tsconfig.json`, and tests.

Architectural decisions are recorded as ADRs inside the project's vault under
`projects/cairndex/decisions/`; the README's [Architecture](./README.md#architecture)
section is the public-facing entry point.

## Workflow

1. **Understand the architecture first.** The README's
   [Architecture](./README.md#architecture) section names the four packages and
   their responsibilities. Open ADRs in the project vault carry the design
   history when more context is needed.
2. **TDD.** Every feature or fix follows: write the failing test → run it and
   confirm failure → implement minimal code → run test and confirm pass →
   commit.
3. **Small commits, conventional messages.** `<type>(<scope>): <short description>`,
   types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
   Bodies wrap at 72 characters.
4. **No `--no-verify`.** If a hook fails, fix the underlying issue.

## Coding style

- TypeScript strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- Immutability by default — return new objects, don't mutate.
- Many small files, each with one clear responsibility (~200-400 lines typical, 800 max).
- No deep nesting (>4 levels). Extract.
- Validate at system boundaries (user input, file I/O, API requests). Trust internal code.
- No comments unless the **why** is non-obvious. Code should explain **what** through naming.
- biome handles formatting (`pnpm format`).

## Testing

- Unit tests: vitest, colocated under `packages/<pkg>/tests/`.
- Use `tmpdir` for any test that touches the filesystem; never the real `~/.cairndex/` or current repo.
- Set `CAIRNDEX_HOME` env var to override the global directory in tests.
- Coverage target: ≥80% for `packages/core/src`, ≥70% for `packages/cli/src`, smoke-only for `packages/web/src`.

## Memory model

cairndex is itself a cairndex project. Once `packages/cli` ships, the repo will have its own `.cairndex/` for tracking specs, decisions, and sessions related to cairndex's development.

Until then, design decisions live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Reporting issues

Open a GitHub issue. For bugs: include `cairndex doctor` output, `node --version`, OS, and steps to reproduce.

## License

By contributing, you agree your contributions are licensed under the MIT License (see `LICENSE`).
