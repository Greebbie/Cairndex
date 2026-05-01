import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { vaultPath } from "@cairndex/core";

interface MTimes {
  [absPath: string]: number;
}

export async function readMtimeStore(repoRoot: string): Promise<MTimes> {
  const p = join(vaultPath(repoRoot), ".doctor-mtime.json");
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(await readFile(p, "utf8")) as MTimes;
  } catch {
    return {};
  }
}

export async function writeMtimeStore(repoRoot: string, m: MTimes): Promise<void> {
  const p = join(vaultPath(repoRoot), ".doctor-mtime.json");
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(m, null, 2), "utf8");
}

export function pathChangedSince(absPath: string, lastSeenMs: number | undefined): boolean {
  if (!existsSync(absPath)) return false;
  const m = statSync(absPath).mtimeMs;
  return lastSeenMs == null || m > lastSeenMs;
}
