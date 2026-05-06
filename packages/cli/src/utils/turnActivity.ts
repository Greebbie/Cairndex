import { execFileSync } from "node:child_process";
import type { Dirent } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const DEFAULT_RECENT_WINDOW_MS = 60 * 60 * 1000;
const EXCLUDED_DIRS = new Set([
  ".git",
  ".cairndex",
  ".next",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "dist-sea",
  "dist-sea-entry",
  "node_modules",
  "out",
]);

export interface FallbackTurnActivityInput {
  memoryRoot: string;
  sourceRoot: string;
  now?: number;
  recentWindowMs?: number;
}

function normalizeRel(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isInside(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !/^[A-Za-z]:/.test(rel));
}

function shouldSkipRelative(rel: string): boolean {
  if (!rel || rel.startsWith("..")) return true;
  return rel.split(/[\\/]+/).some((part) => EXCLUDED_DIRS.has(part));
}

function collectGitStatusPaths(sourceRoot: string): string[] {
  try {
    const raw = execFileSync("git", ["-C", sourceRoot, "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const paths: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const body = line.slice(3).trim();
      const path = body.includes(" -> ") ? body.split(" -> ").pop() : body;
      if (path) paths.push(normalizeRel(path));
    }
    return paths.filter((path) => !shouldSkipRelative(path));
  } catch {
    return [];
  }
}

async function collectRecentSourcePaths(sourceRoot: string, cutoffMs: number): Promise<string[]> {
  if (!existsSync(sourceRoot)) return [];
  const out = new Set<string>();
  const stack = [sourceRoot];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    let entries: Dirent<string>[];
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      const rel = normalizeRel(relative(sourceRoot, full));
      if (shouldSkipRelative(rel)) continue;
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        if (statSync(full).mtimeMs >= cutoffMs) out.add(rel);
      } catch {
        // Ignore files that disappear during scanning.
      }
    }
  }
  return [...out].sort();
}

async function collectRecentMemoryMarkdown(
  memoryRoot: string,
  cutoffMs: number,
): Promise<string[]> {
  if (!existsSync(memoryRoot)) return [];
  const out = new Set<string>();
  const stack = [memoryRoot];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    let entries: Dirent<string>[];
    try {
      entries = await readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "archive" && !entry.name.startsWith(".")) stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      try {
        if (statSync(full).mtimeMs >= cutoffMs) out.add(full);
      } catch {
        // Ignore files that disappear during scanning.
      }
    }
  }
  return [...out].sort();
}

export async function collectFallbackTurnTouchedPaths(
  input: FallbackTurnActivityInput,
): Promise<string[]> {
  const sourceRoot = resolve(input.sourceRoot);
  const memoryRoot = resolve(input.memoryRoot);
  const cutoffMs = (input.now ?? Date.now()) - (input.recentWindowMs ?? DEFAULT_RECENT_WINDOW_MS);
  const out = new Set<string>();

  for (const path of collectGitStatusPaths(sourceRoot)) out.add(path);

  if (out.size === 0) {
    for (const path of await collectRecentSourcePaths(sourceRoot, cutoffMs)) out.add(path);
  }

  if (out.size === 0 && !isInside(sourceRoot, memoryRoot)) {
    for (const path of await collectRecentMemoryMarkdown(memoryRoot, cutoffMs)) out.add(path);
  }

  return [...out].sort();
}
