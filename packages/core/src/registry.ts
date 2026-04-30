import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ProjectEntry {
  path: string;
  alias: string;
  registered_at: string;
  last_opened?: string;
}

const REGISTRY_FILE = "projects.json";
const SHARED_DIR = "shared";

export function globalDir(): string {
  return process.env.CAIRNDEX_HOME ?? join(homedir(), ".cairndex");
}

export function sharedDir(): string {
  return join(globalDir(), SHARED_DIR);
}

function registryPath(): string {
  return join(globalDir(), REGISTRY_FILE);
}

async function readAll(): Promise<ProjectEntry[]> {
  const p = registryPath();
  if (!existsSync(p)) return [];
  const raw = await readFile(p, "utf8");
  try {
    const parsed = JSON.parse(raw) as { projects?: ProjectEntry[] };
    return parsed.projects ?? [];
  } catch {
    return [];
  }
}

async function writeAll(projects: ProjectEntry[]): Promise<void> {
  await mkdir(globalDir(), { recursive: true });
  await writeFile(registryPath(), JSON.stringify({ projects }, null, 2), "utf8");
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listProjects(): Promise<ProjectEntry[]> {
  return await readAll();
}

export async function registerProject(input: {
  path: string;
  alias: string;
}): Promise<ProjectEntry> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.path === input.path);
  const entry: ProjectEntry = {
    path: input.path,
    alias: input.alias,
    registered_at: idx >= 0 && all[idx]?.registered_at ? all[idx].registered_at : nowIso(),
    ...(idx >= 0 && all[idx]?.last_opened ? { last_opened: all[idx].last_opened } : {}),
  };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await writeAll(all);
  return entry;
}

export async function unregisterProject(path: string): Promise<void> {
  const all = await readAll();
  const next = all.filter((p) => p.path !== path);
  await writeAll(next);
}

export async function touchProject(path: string): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((p) => p.path === path);
  if (idx < 0) return;
  const entry = all[idx];
  if (!entry) return;
  all[idx] = { ...entry, last_opened: nowIso() };
  await writeAll(all);
}
