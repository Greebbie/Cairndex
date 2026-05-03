import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";

/**
 * Machine-scoped user preferences. Lives at `~/.cairndex/preferences.yaml`
 * (or `$CAIRNDEX_HOME/preferences.yaml`).
 *
 * **Precedence:** vault rules > project config > user prefs > built-in defaults.
 * User prefs are personal — they do NOT travel with the vault. If a vault explicitly
 * sets the same key, the vault wins so a team sharing a vault sees consistent behavior.
 *
 * Keep this schema small. Add a key only when (a) it's per-user (theme, personal
 * threshold) AND (b) it makes sense to override at the project level.
 */
export const UserPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    /** UI theme. Defaults to "system" when omitted. */
    theme: z.enum(["light", "dark", "system"]).default("system"),
    /**
     * Personal default for the doctor freshness warning, in days. Overridden by
     * vault config when set there. Null = inherit built-in default.
     */
    defaultFreshnessWarnDays: z.number().int().positive().nullable().default(null),
    /**
     * Default confidence threshold for any future auto-accept feature. Off when
     * unset; the inbox stays manual-review-only.
     */
    autoAcceptConfidenceThreshold: z.number().min(0).max(1).nullable().default(null),
    /**
     * Path to a personal rules markdown file. The agent reads this in addition to
     * the vault rules. Use case: per-user style guidance that shouldn't pollute the
     * shared vault rules.
     */
    personalRulesPath: z.string().nullable().default(null),
    /**
     * Absolute path to the last vault the user opened with `cairndex ui`. Set after
     * a successful `--vault <path>` launch (or vault init via the GUI onboarding
     * flow). When `cairndex ui` is invoked with no `--vault` flag — e.g. by
     * double-clicking the exe — the CLI uses this to reopen the same vault instead
     * of falling back to the legacy `~/.cairndex/projects.json` registry.
     *
     * Cleared automatically when the path no longer exists, so a deleted/moved
     * vault doesn't permanently break startup.
     */
    lastVaultRoot: z.string().nullable().default(null),
  })
  .strict();

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = UserPreferencesSchema.parse({});

export function userPreferencesPath(): string {
  const home = process.env.CAIRNDEX_HOME ?? join(homedir(), ".cairndex");
  return join(home, "preferences.yaml");
}

/**
 * Read user preferences from disk. Returns the defaults when the file does not
 * exist or cannot be parsed — never throws so callers can rely on a usable shape.
 *
 * Pass `path` to override the file location (used by tests).
 */
export async function readUserPreferences(path?: string): Promise<UserPreferences> {
  const target = path ?? userPreferencesPath();
  if (!existsSync(target)) return DEFAULT_USER_PREFERENCES;
  try {
    const raw = await readFile(target, "utf8");
    const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) ?? {};
    const result = UserPreferencesSchema.safeParse(parsed);
    if (!result.success) return DEFAULT_USER_PREFERENCES;
    return result.data;
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
}

/**
 * Persist user preferences to disk. Validates input through the schema so a malformed
 * write is rejected before touching the file. Creates the parent directory if needed.
 */
export async function writeUserPreferences(
  next: Partial<UserPreferences>,
  path?: string,
): Promise<UserPreferences> {
  const target = path ?? userPreferencesPath();
  const current = await readUserPreferences(target);
  const merged = { ...current, ...next };
  const validated = UserPreferencesSchema.parse(merged);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, yaml.dump(validated), "utf8");
  return validated;
}
