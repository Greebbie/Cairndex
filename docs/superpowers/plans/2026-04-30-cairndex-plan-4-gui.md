# cairndex Plan 4 — Server + Web GUI

> **Status**: OUTLINE — full TDD task detail to be written after Plan 3 is implemented.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans once this plan is fully detailed.

**Goal:** Build `packages/server` (Fastify HTTP + SSE) and `packages/web` (React + Vite app), then wire `cairndex ui` (Plan 3) to launch them. The GUI is a multi-project browser/manager: project list, dashboard, browse, file view, timeline, settings.

**Architecture:**
- `packages/server` — Fastify factory that accepts a `@cairndex/core` instance and exposes REST + SSE. No business logic; routes are thin adapters over core.
- `packages/web` — React SPA that consumes the server. Bundled into `packages/cli/dist/web/` at publish time and served by the embedded server when `cairndex ui` is invoked.
- The `cairndex ui` command (Plan 3) imports `packages/server`, instantiates it on a free port, opens the user's browser to `http://localhost:<port>`, and starts the watcher.

**Tech Stack:** Fastify, @fastify/cors, @fastify/static, EventSource (SSE) on the wire (no @fastify/sse needed — manual implementation is small), React 18, Vite, TailwindCSS, shadcn/ui, react-markdown + remark-gfm + rehype-highlight + custom remark plugin for `[[wikilinks]]`, react-hook-form, zod (shared), TanStack Query.

**Spec:** `docs/superpowers/specs/2026-04-30-cairndex-design.md` §8.

**Working directory:** `C:\Users\lvbab\Documents\GitHub\Cairndex`

**Prerequisites:** Plans 1, 2, 3 merged.

---

## File Structure

```
packages/server/
  package.json
  tsconfig.json
  src/
    index.ts                  # createServer({ core, port }): Fastify
    routes/
      projects.ts             # GET /api/projects
      vault.ts                # GET /api/vault/:project (overview), GET /api/vault/:project/:type/:id (single)
      config.ts               # GET/PATCH /api/config/:scope (project|global)
      changes.ts              # GET /api/changes/:project (timeline)
      doctor.ts               # POST /api/doctor/:project (run validation), POST .../fix
      sync.ts                 # POST /api/sync/:project
      insight.ts              # POST /api/insight/:project/promote, /pull
    sse.ts                    # SSE broadcast for watcher events
    static.ts                 # serve packages/web build at /
  tests/
    server.smoke.test.ts

packages/web/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  postcss.config.js
  tailwind.config.ts
  src/
    main.tsx
    App.tsx
    router.tsx
    pages/
      Dashboard.tsx
      Browse.tsx
      File.tsx
      Timeline.tsx
      Settings.tsx
    components/
      Sidebar.tsx              # project switcher
      PhaseTracker.tsx
      FileTree.tsx
      FrontmatterCard.tsx
      BacklinksPanel.tsx
      MarkdownView.tsx
      DoctorBadge.tsx
    lib/
      api.ts                   # TanStack Query hooks against server
      sse.ts                   # EventSource client; reconnect logic
      remarkWikilinks.ts       # custom remark plugin
      types.ts                 # zod-derived shared types
  tests/
    e2e/
      smoke.spec.ts            # Playwright
```

---

## Task 1: Server Scaffold

`packages/server/package.json` depends on `@cairndex/core@workspace:*` + fastify + @fastify/cors + @fastify/static. `createServer({ core, port })` returns a Fastify app; `start()` listens. Logging via pino.

**Commit**: `feat(server): scaffold @cairndex/server with Fastify factory`

---

## Task 2: REST Routes (read-only first)

- `GET /api/projects` → returns `core.registry.list()`
- `GET /api/vault/:project` → returns vault overview: counts per type, recent sessions, current phase from `index.md`
- `GET /api/vault/:project/:type/:id` → returns one node: `{ frontmatter, body, backlinks, outgoing }`
- `GET /api/changes/:project` → reads `changes/changelog.md`, returns chronological events
- `GET /api/config/:scope` (`project` or `global`) → returns parsed YAML

Path params encode project alias from registry. Server resolves alias → repo path before calling core.

**Tests**: smoke each route against a fixture vault. Assert status, JSON shape.

**Commit**: `feat(server): add read-only REST routes`

---

## Task 3: Mutating Routes

- `PATCH /api/config/:scope` → write YAML file with zod validation
- `POST /api/doctor/:project` → run `core.runValidation`, return issues
- `POST /api/doctor/:project/fix` → run `core.validate.fix.applyAutoFixes`, return changed files
- `POST /api/sync/:project` → run `core.sync.runSync`, return summary
- `POST /api/insight/:project/promote { id }` → core.insightPromote
- `POST /api/insight/:project/pull { id }` → core.insightPull

**Tests**: each route, success and failure paths. Server should not crash on invalid input — return 400 with zod error details.

**Commit**: `feat(server): add mutating REST routes for config, doctor, sync, insight`

---

## Task 4: SSE for Watcher Events

`GET /api/events/:project` opens an SSE stream. Server registers a `core.watcher` callback that pushes events: `{ type: 'file-changed' | 'archived' | 'reciprocal-added' | 'index-refreshed', payload }`. Client reconnects with last-event-id on disconnect.

**Tests**: connect SSE in test, write a file in fixture, assert event arrives within 1s.

**Commit**: `feat(server): add SSE stream for watcher events`

---

## Task 5: Static Asset Serving

When `process.env.NODE_ENV === 'production'`, server serves the built web app from `packages/cli/dist/web/`. In dev, server only handles `/api/*` and assumes the web app runs on Vite's dev port (5173).

**Commit**: `feat(server): serve web/ static assets in production`

---

## Task 6: Web Scaffold (Vite + React + Tailwind + shadcn/ui)

`pnpm create vite packages/web --template react-ts`, then add Tailwind, shadcn/ui (init), TanStack Query, react-markdown + plugins. Configure Vite with proxy to `localhost:<server-port>/api`.

**Commit**: `feat(web): scaffold Vite + React + Tailwind + shadcn/ui`

---

## Task 7: API Client and SSE Hook

`src/lib/api.ts` defines TanStack Query hooks: `useProjects`, `useVault`, `useNode`, `useChanges`, `useConfig`, `useDoctor`, mutations for `useFix`, `useSync`, `usePromote`, `usePull`, `useUpdateConfig`. `src/lib/sse.ts` provides `useWatcherEvents()` that subscribes to SSE and invalidates relevant queries on each event.

**Tests**: mock server in MSW; test each hook returns expected data.

**Commit**: `feat(web): add API client (TanStack Query) and SSE subscription hook`

---

## Task 8: Sidebar (Project Switcher)

Left rail shows registered projects from `useProjects`. Click switches active project (URL is `/p/:alias/...`). "+ Add" prompts for path, calls a server endpoint that registers it (or reads from existing local registry — TBD: client-side `cairndex` daemon, NOT a remote operation).

**Commit**: `feat(web): add project switcher sidebar`

---

## Task 9: Dashboard Page

Renders current project's `index.md` (using react-markdown + wikilinks plugin). Above it, a phase tracker pill, the doctor badge (errors/warnings counts), and three cards: most-recent session, open questions count, recent changes (top 5).

**Commit**: `feat(web): add Dashboard page with phase tracker and key cards`

---

## Task 10: Browse + File View

`Browse.tsx` shows file tree by type. Click → `File.tsx` page. File page renders markdown body with syntax highlighting. Right rail: frontmatter card (formatted nicely, hides arrays as collapsibles), outgoing typed links (clickable to other File pages), backlinks panel, provenance + verification panel (if present).

**Commit**: `feat(web): add Browse and File view pages with backlinks`

---

## Task 11: Timeline Page

Reads `useChanges`. Filterable by node type and date range. Each event shows: timestamp, type pill, target (clickable), summary. Server-side already merges changelog events with status transitions detected from validate.

**Commit**: `feat(web): add Timeline page with filtering`

---

## Task 12: Settings Page

Two tabs: Project and Global. Each is a form generated from the zod ConfigSchema (one section per group: folders, ids, required_frontmatter, verification, freshness). On save, calls `PATCH /api/config/:scope`. Success/error toast.

**Tests**: form prefills correctly from server data; save calls API with normalized payload.

**Commit**: `feat(web): add Settings page (project and global config forms)`

---

## Task 13: Wire `cairndex ui` to Server (replace Plan 3 stub)

Modify `packages/cli/src/commands/ui.ts`:
1. Find a free port (default 7777, fall back to next available)
2. Import `createServer` from `@cairndex/server`
3. Instantiate with `{ core, port }`, start watcher
4. Open the user's default browser to `http://localhost:<port>` via `open` package
5. Trap `SIGINT`/`SIGTERM` to gracefully stop watcher and server

**Tests**: spawn the CLI in a child process, GET the root URL, assert it returns the web app's HTML.

**Commit**: `feat(cli): wire ui command to launch server, watcher, and browser`

---

## Task 14: Build Pipeline

When publishing the `cairndex` npm package:
1. Build `@cairndex/core`
2. Build `@cairndex/server`
3. Build `@cairndex/web` (Vite production build → `packages/web/dist`)
4. Copy `packages/web/dist` → `packages/cli/dist/web`
5. Build `@cairndex/cli` with tsup; bin shim points at `dist/bin.js`
6. The published `cairndex` package on npm bundles the cli + the static web build; core and server are dependencies.

Add a root script `pnpm package` that runs all steps.

**Commit**: `chore(build): wire end-to-end build pipeline for npm publish`

---

## Task 15: Smoke E2E (Playwright)

`packages/web/tests/e2e/smoke.spec.ts`:
1. Spawn `cairndex ui` against a fixture project (set `CAIRNDEX_HOME` to tmp)
2. Open browser to URL
3. Click through: project switcher, Dashboard, Browse a file, Timeline, Settings
4. Edit one setting, save, refresh, assert persisted
5. Stop server cleanly

**Commit**: `test(web): add Playwright smoke E2E for the GUI`

---

## Acceptance (Plan 4)

1. `cairndex ui` opens a browser; user sees the dashboard.
2. Switching projects works.
3. Browse → File view → backlinks navigation works.
4. Timeline shows recent changes.
5. Editing a setting persists to `config.yaml`.
6. Watcher events arrive over SSE within 1s of file changes.
7. Playwright smoke E2E passes on Linux + macOS + Windows CI.
8. `pnpm package` produces a publishable `cairndex` tarball.

---

## Out of Scope (Plan 4 / MVP)

- Graph view (react-flow): v0.2.
- "New entry" forms: v0.2.
- Search/filter UI: v0.2.
- Markdown body editing in the GUI: never (use Obsidian/VS Code).
- Authentication: never (local-only).
- Tauri desktop app: v1.0.
- MCP server: v1.0.
