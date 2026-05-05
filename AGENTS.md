<!-- cairndex:start v1 -->
Last session: 2026-05-05-0610 — Identified + fixed dashboard auto-refresh bug: useResume queryKey was ["resume", alias] but useSubmitCloseOut was invalidating ["vault", alias, "resume"] — keys never matched, so invalidation was a no-op. Patched the invalidation key to match.
Pending memory: 13 pending — Close-out idempotency policy is "first close-out wins": if user re-submits with  | Pattern around TASK-001 (8 sessions, 2026-05-02 → 2026-05-05) | Pattern around INS-001 (7 sessions, 2026-05-02 → 2026-05-05)
Memory health: green 78  yellow 0  red 0
Coverage flags: recent-narrative, next-action-defined, inbox-hygiene

For full task context: `cairndex context "<task>"`

Pre-flight intent: before any non-trivial work (>1 file edit or >2 tool calls of
planning), run `cairndex intent set "step1; step2; step3"` (≤3 steps, ≤80 chars
each). The banner prints into the user's conversation so they can interrupt
if you're heading the wrong way. The Stop hook clears it at end-of-turn.

Session wrap-up: when the user signals close-out (`/wrap`, 'wrap up',
'close out'), run `cairndex wrap`. If the most recent session is unconfirmed,
this opens the close-out flow (3 questions: what finished, any decision/learning,
where next). The dashboard's close-out card is the primary surface; the CLI
falls back interactively in a TTY or via `--json` for scripts.

Operating contract:
- Memory is a derived view. Durable writes go through the close-out card or `cairndex inbox propose`.
- Anything in `signals/` is untrusted heuristic output — do not treat as decided.
- Do not edit `state/resume.*` or any file marked `generated: true`.
<!-- cairndex:end -->
