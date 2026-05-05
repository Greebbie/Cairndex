---
description: Cairndex session close-out — runs `cairndex wrap` and offers to fix any warnings.
---

Run `cairndex wrap` and read the close-out report.

Then, for each ⚠ warning the report surfaces:

- **"Active task is pending/in_progress" + the user has indicated the work is done** → propose `cairndex task complete <id>` and ask before running.
- **"Session next is empty"** → ask the user what the next session should pick up. Once they answer, append bullets via `cairndex session log progress --text "..."` (or `cairndex inbox propose-update` if it belongs in a spec/plan rather than a free-form session note).
- **"N inbox proposals pending"** → list the headlines with one-line summaries; ask the user if they want to triage now.
- **"Doctor: N errors, M warnings"** → run `cairndex doctor --fix` and report what got auto-repaired vs. what still needs human attention.

After addressing warnings (or if the user declines), output a one-line summary and stop. Do **not** mutate vault canonical files without explicit user confirmation — proposals only.

Important: this command is **read-then-suggest**, not auto-fix-everything. Each mutation requires the user's go-ahead.
