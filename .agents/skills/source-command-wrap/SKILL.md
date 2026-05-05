---
name: "source-command-wrap"
description: "Cairndex session close-out — runs `cairndex wrap` to open the close-out flow."
---

# source-command-wrap

Use this skill when the user asks to run the migrated source command `wrap`.

## Command Template

Run `cairndex wrap --json` and read the action descriptor.

- If `action === "openCloseOut"`: the most recent session is unconfirmed. Open the close-out card in the dashboard, or run `cairndex closeout --session <sessionId>` interactively to walk through the 3 questions (what finished, any decision/learning, where next).
- If `action === "nothingToClose"`: the most recent session is already confirmed (or no sessions exist yet). Nothing to do — let the user know.

Do **not** reproduce the old doctor/inbox warning report. If the user wants a vault health check, direct them to `cairndex doctor`.
