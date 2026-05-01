import type { Config } from "./config.js";
import { NODE_TYPES, type NodeType } from "./types.js";
import { listNodeFiles } from "./vault.js";

export interface Backlink {
  from: string;
  fromType: NodeType; // source node's type
  type: string; // typed-edge type, or "mentions" for wikilinks
}

export type BacklinkIndex = Map<string, Backlink[]>;

const WIKILINK_RE = /\[\[([A-Z]+-\d+|[\d-]+)\]\]/g;

interface LinkLike {
  type: string;
  target: string;
}

export async function computeBacklinks(repoRoot: string, cfg: Config): Promise<BacklinkIndex> {
  const idx: BacklinkIndex = new Map();
  const all: { id: string; type: NodeType; body: string; frontmatter: Record<string, unknown> }[] =
    [];
  for (const t of NODE_TYPES) {
    for (const n of await listNodeFiles(repoRoot, cfg, t)) {
      all.push({ id: n.id, type: t, body: n.body, frontmatter: n.frontmatter });
      if (!idx.has(n.id)) idx.set(n.id, []);
    }
  }
  for (const n of all) {
    // typed edges
    const links = (n.frontmatter.links ?? []) as LinkLike[];
    if (Array.isArray(links)) {
      for (const link of links) {
        if (!link?.target) continue;
        const list = idx.get(link.target) ?? [];
        list.push({ from: n.id, fromType: n.type, type: link.type });
        idx.set(link.target, list);
      }
    }
    // wikilinks in body
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null = WIKILINK_RE.exec(n.body);
    while (m !== null) {
      const target = m[1];
      if (target) {
        const list = idx.get(target) ?? [];
        list.push({ from: n.id, fromType: n.type, type: "mentions" });
        idx.set(target, list);
      }
      m = WIKILINK_RE.exec(n.body);
    }
  }
  return idx;
}
