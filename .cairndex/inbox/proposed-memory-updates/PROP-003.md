---
id: PROP-003
proposalType: create
targetType: change
status: pending
summary: Record bug-fix #2 — immutable type enforcement at proposal layer
reason: UX-audit item #2 (P0 data loss) was fixed in this session; vault needs an audit-trail entry recording it
contentHash: e969a81d0a2331fef24a21f5c1da88af4504a397539eb759df74d8cbf7807d65
created: '2026-05-03T00:55:00.000Z'
provenance:
  created_by: claude-code
  session: 2026-05-03-immutable-fix
newFrontmatter:
  title: Enforce immutable node types at proposal layer
  date: 2026-05-03
  type: fixed
  target: inbox-immutability
  summary: Reject `update` proposals against decision/session/change/insight at create + accept time. Configurable via .cairndex/config.yaml → immutable_types.
---
Bug-fix audit entry for UX-audit item #2 (P0 data loss).

Two proposals targeting the same node could be accepted in sequence with the second silently overwriting the first. Root cause: the proposal layer had no enforcement that immutable node types reject 'update' proposals.

Fix is structural — guard at proposal create AND at accept (defense in depth), driven by a new isImmutableType(cfg, typeName) predicate that checks both cfg.immutable_types and per-custom-type node_types[name].immutable. Default immutable list (decision, session, change, insight) is configurable in .cairndex/config.yaml. Mutable types (spec, plan, task, goal, intent, question) keep latest-wins behavior by design.

Files: packages/core/src/config.ts, packages/core/src/inbox/{create,accept}.ts, packages/core/tests/inbox-proposal.test.ts (5 new cases), .cairndex/rules/operating-rules.md (line 47).
