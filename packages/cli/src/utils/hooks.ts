import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface HookCommand {
  type: "command";
  command: string;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

interface ClaudeSettings {
  hooks?: {
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

const CAIRNDEX_HOOK_TAG = "cairndex-managed";

const CAIRNDEX_HOOKS: { PostToolUse: HookEntry[]; Stop: HookEntry[] } = {
  PostToolUse: [
    {
      matcher: "Write|Edit",
      hooks: [
        {
          type: "command",
          command: `cairndex doctor --silent --fix --scope changed --filter-path .cairndex/ # ${CAIRNDEX_HOOK_TAG}`,
        },
      ],
    },
  ],
  Stop: [
    {
      hooks: [
        {
          type: "command",
          command: `cairndex doctor --silent --auto-session # ${CAIRNDEX_HOOK_TAG}`,
        },
      ],
    },
  ],
};

function entryIsCairndexManaged(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as { hooks?: unknown };
  if (!Array.isArray(e.hooks)) return false;
  return e.hooks.some(
    (h): boolean =>
      typeof h === "object" &&
      h !== null &&
      "command" in h &&
      typeof (h as { command: unknown }).command === "string" &&
      (h as { command: string }).command.includes(CAIRNDEX_HOOK_TAG),
  );
}

export async function applyClaudeHooks(repoRoot: string): Promise<void> {
  const path = join(repoRoot, ".claude", "settings.json");
  let existing: ClaudeSettings = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as ClaudeSettings;
    } catch {
      existing = {};
    }
  }
  existing.hooks = existing.hooks ?? {};
  for (const evt of ["PostToolUse", "Stop"] as const) {
    const list = (existing.hooks[evt] ?? []) as HookEntry[];
    const filtered = list.filter((h) => !entryIsCairndexManaged(h));
    existing.hooks[evt] = [...filtered, ...CAIRNDEX_HOOKS[evt]];
  }
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
}
