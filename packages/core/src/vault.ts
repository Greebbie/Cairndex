import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "./config.js";
import { folderForNodeType, folderForType } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { parseId } from "./ids.js";
import { nodeFolderPath, vaultPath } from "./paths.js";
import type { NodeType } from "./types.js";

export interface NodeFile {
  type: NodeType;
  id: string;
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface WriteNodeInput {
  frontmatter: Record<string, unknown>;
  body: string;
  slug?: string;
}

export function vaultExists(repoRoot: string): boolean {
  return existsSync(vaultPath(repoRoot));
}

function isNodeFile(filename: string): boolean {
  if (!filename.endsWith(".md")) return false;
  if (filename.toLowerCase() === "readme.md") return false;
  return true;
}

function idFromFilename(filename: string): string | null {
  const stem = filename.replace(/\.md$/, "");
  // Try "PREFIX-NUM[-slug]" first.
  const seq = parseId(stem.split("-").slice(0, 2).join("-"));
  if (seq) return seq.raw;
  // Fall back to date-based session id "yyyy-MM-dd-HHmm" (4 segments).
  const sessionMatch = /^(\d{4}-\d{2}-\d{2}-\d{4})/.exec(stem);
  if (sessionMatch) return sessionMatch[1] ?? null;
  return null;
}

export async function listNodeIds(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
): Promise<string[]> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  if (!existsSync(folder)) return [];
  const entries = await readdir(folder);
  const ids: string[] = [];
  for (const e of entries) {
    if (!isNodeFile(e)) continue;
    const id = idFromFilename(e);
    if (id) ids.push(id);
  }
  return ids;
}

export async function listNodeFiles(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
): Promise<NodeFile[]> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  if (!existsSync(folder)) return [];
  const entries = await readdir(folder);
  const out: NodeFile[] = [];
  for (const e of entries) {
    if (!isNodeFile(e)) continue;
    const id = idFromFilename(e);
    if (!id) continue;
    const full = join(folder, e);
    const raw = await readFile(full, "utf8");
    const { data, content } = parseFrontmatter(raw);
    out.push({ type, id, path: full, frontmatter: data, body: content });
  }
  return out;
}

export async function readNode(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
  id: string,
): Promise<NodeFile | null> {
  const all = await listNodeFiles(repoRoot, cfg, type);
  return all.find((n) => n.id === id) ?? null;
}

export async function writeNode(
  repoRoot: string,
  cfg: Config,
  type: NodeType,
  input: WriteNodeInput,
): Promise<string> {
  const folder = nodeFolderPath(repoRoot, folderForNodeType(cfg, type));
  await mkdir(folder, { recursive: true });
  const id = String(input.frontmatter.id ?? "");
  if (!id) throw new Error("writeNode: frontmatter.id is required");
  const filename = input.slug ? `${id}-${input.slug}.md` : `${id}.md`;
  const fullPath = join(folder, filename);
  const out = serializeFrontmatter(input.frontmatter, input.body);
  await writeFile(fullPath, out, "utf8");
  return fullPath;
}

export function fileBasename(path: string): string {
  return basename(path);
}

/**
 * Generic listing that accepts any type name (built-in or custom). Returns []
 * when the type is not declared anywhere, so a stale/unknown name in the URL
 * yields an empty list rather than a crash.
 */
export async function listNodeFilesByName(
  repoRoot: string,
  cfg: Config,
  typeName: string,
): Promise<NodeFile[]> {
  const folder = folderForType(cfg, typeName);
  if (!folder) return [];
  const dir = nodeFolderPath(repoRoot, folder);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: NodeFile[] = [];
  for (const e of entries) {
    if (!isNodeFile(e)) continue;
    const id = idFromFilename(e);
    if (!id) continue;
    const full = join(dir, e);
    const raw = await readFile(full, "utf8");
    const { data, content } = parseFrontmatter(raw);
    // Cast the type label so callers can carry custom names through the same shape.
    out.push({ type: typeName as NodeType, id, path: full, frontmatter: data, body: content });
  }
  return out;
}

export async function readNodeByName(
  repoRoot: string,
  cfg: Config,
  typeName: string,
  id: string,
): Promise<NodeFile | null> {
  const all = await listNodeFilesByName(repoRoot, cfg, typeName);
  return all.find((n) => n.id === id) ?? null;
}
