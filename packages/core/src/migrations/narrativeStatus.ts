import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, serializeFrontmatter } from "../frontmatter.js";
import { vaultPath } from "../paths.js";

export interface MigrateOptions {
  cwd: string;
  vaultRoot?: string;
  projectId?: string;
}

export interface MigrateResult {
  scanned: number;
  updated: number;
  skipped: number;
}

/**
 * Backfill `narrative_status: empty` into session files that are missing the field.
 *
 * Intentionally avoids the Zod schema: `.default("empty")` would mask absence of the
 * field, making it impossible to distinguish "field not written" from "field written as
 * empty". We use raw `parseFrontmatter<Record<string, unknown>>` so absence is visible.
 *
 * Idempotent: files that already have `narrative_status` (any value) are left untouched.
 */
export async function migrateNarrativeStatus(opts: MigrateOptions): Promise<MigrateResult> {
  const sessionsDir = join(vaultPath(opts.cwd), "sessions");

  let entries: string[] = [];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    scanned++;
    const filePath = join(sessionsDir, name);
    const raw = await fs.readFile(filePath, "utf8");
    const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);

    if (typeof data.narrative_status === "string") {
      skipped++;
      continue;
    }

    const updated_data = { ...data, narrative_status: "empty" };
    await fs.writeFile(filePath, serializeFrontmatter(updated_data, content), "utf8");
    updated++;
  }

  return { scanned, updated, skipped };
}
