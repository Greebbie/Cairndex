import { resolve } from "node:path";
import { centralVaultExists } from "@cairndex/core";

export type ActiveVaultSource = "opt" | "pref" | "pref-stale" | "none";

export interface ActiveVaultSelection {
  /** Absolute path to use for `listVaultProjects()`. Null → fall back to legacy registry. */
  vaultRoot: string | null;
  /**
   * Where the value came from:
   *   "opt"        — explicit `--vault <path>` from the user
   *   "pref"       — remembered `lastVaultRoot` from user prefs (still valid)
   *   "pref-stale" — `lastVaultRoot` was set but no longer points at a vault; caller
   *                  should clear it from prefs and log
   *   "none"       — neither option present; legacy registry path
   */
  source: ActiveVaultSource;
}

export interface ResolveActiveVaultInput {
  /** `--vault <path>` from the CLI, if supplied. */
  optVaultRoot?: string;
  /** `prefs.lastVaultRoot` from user prefs (null when never set). */
  prefVaultRoot: string | null;
  /** Test seam — defaults to `centralVaultExists` from @cairndex/core. */
  vaultExists?: (vaultRoot: string) => boolean;
}

/**
 * Pick which vault `cairndex ui` should open. Pure function; no I/O beyond the
 * `vaultExists` callback. Caller is responsible for persisting "opt" choices and
 * clearing "pref-stale" entries from disk.
 *
 * Precedence:
 *   1. Explicit `--vault` always wins (and gets remembered).
 *   2. Remembered `lastVaultRoot` if it still resolves to a real vault.
 *   3. Otherwise, fall back to the legacy global registry.
 *
 * Stale prefs are surfaced rather than silently dropped — the CLI should log when
 * a remembered vault disappears so the user can spot it.
 */
export function resolveActiveVault(input: ResolveActiveVaultInput): ActiveVaultSelection {
  const exists = input.vaultExists ?? centralVaultExists;
  if (input.optVaultRoot) {
    return { vaultRoot: resolve(input.optVaultRoot), source: "opt" };
  }
  if (input.prefVaultRoot) {
    const resolved = resolve(input.prefVaultRoot);
    if (exists(resolved)) {
      return { vaultRoot: resolved, source: "pref" };
    }
    return { vaultRoot: null, source: "pref-stale" };
  }
  return { vaultRoot: null, source: "none" };
}
