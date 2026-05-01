---
id: TASK-001
title: Bump vite to 6.x and verify web build/dev flow
status: pending
tags: [security, dependencies, dev-tooling, deferred]
created: 2026-05-02
updated: 2026-05-02
provenance:
  created_by: claude-code
  session: 2026-05-02-0125
links:
  - ADR-001
---

## Description

After Phase 1 of Memory Cockpit ships, bump `vite` from `^5.4.0` to `^6.0.0` in `packages/web` to clear the two remaining `pnpm audit` warnings (esbuild + vite dev-server CVEs, both dev-only).

Per ADR-001 these were waived in Phase 0 to avoid bundling unrelated breaking-change risk into the Memory Cockpit work.

## Acceptance

- `packages/web/package.json` declares `"vite": "^6.0.0"`.
- `pnpm install`, `pnpm test`, `pnpm build`, `pnpm dev` (web) all succeed.
- `pnpm audit` reports 0 vulnerabilities related to vite/esbuild.
- No regressions in existing web E2E or unit tests.
